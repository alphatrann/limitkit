import { RateLimiter } from '@limitkit/core';
import Redis from 'ioredis';
import {
  fixedWindow,
  gcra,
  leakyBucket,
  RedisStore,
  shapingLeakyBucket,
  slidingWindow,
  slidingWindowCounter,
  tokenBucket,
} from '../src';

const now = 1_000_000;

const algorithms: ReadonlyArray<readonly [string, () => any]> = [
  ['FixedWindow', () => fixedWindow({ limit: 5, window: 10 })],
  ['SlidingWindow', () => slidingWindow({ limit: 5, window: 10 })],
  [
    'SlidingWindowCounter',
    () => slidingWindowCounter({ limit: 5, window: 10 }),
  ],
  ['TokenBucket', () => tokenBucket({ capacity: 5, refillRate: 1 })],
  ['LeakyBucket', () => leakyBucket({ capacity: 5, leakRate: 1 })],
  [
    'ShapingLeakyBucket',
    () => shapingLeakyBucket({ capacity: 5, leakRate: 1 }),
  ],
  ['GCRA', () => gcra({ burst: 5, interval: 2 })],
];

describe('RedisStore.peek (ioredis)', () => {
  let redis: Redis;
  let store: RedisStore;

  beforeAll(async () => {
    redis = new Redis('redis://localhost:6379', {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    await redis.connect();
    store = new RedisStore(redis);
  });

  beforeEach(async () => {
    await redis.flushdb();
  });

  afterAll(async () => {
    await redis.flushall();
    redis.disconnect();
  });

  describe.each(algorithms)('%s', (_name, make) => {
    it('creates no key for an unseen key', async () => {
      expect((await store.peek('k', make(), now)).allowed).toBe(true);
      expect(await redis.keys('*')).toEqual([]);
    });

    it('reports exactly what the next consume would, without changing it', async () => {
      const algo = make();
      for (let i = 0; i < 3; i++) await store.consume('k', algo, now);

      const first = await store.peek('k', algo, now);
      const second = await store.peek('k', algo, now);

      expect(second).toEqual(first);
      expect(await store.consume('k', algo, now)).toEqual(first);
    });

    it('stays rejected once the quota is spent', async () => {
      const algo = make();
      for (let i = 0; i < 5; i++) await store.consume('k', algo, now);

      const first = await store.peek('k', algo, now);

      expect(first.allowed).toBe(false);
      expect(await store.peek('k', algo, now)).toEqual(first);
    });
  });

  it('recovers from NOSCRIPT when peeking', async () => {
    const algo = fixedWindow({ limit: 5, window: 10 });
    await store.peek('k', algo, now); // caches the script SHA
    await redis.script('FLUSH');

    expect((await store.peek('k', algo, now)).allowed).toBe(true);
  });

  describe('RateLimiter.peek end to end', () => {
    it('reads real state without drawing it down', async () => {
      const limiter = new RateLimiter({
        store,
        rules: [
          {
            name: 'a',
            key: 'e2e',
            policy: slidingWindow({ limit: 2, window: 60 }),
          },
        ],
      });

      expect((await limiter.peek({})).rules[0].remaining).toBe(1);
      expect(await redis.keys('*')).toEqual([]);

      await limiter.consume({});
      await limiter.consume({});

      const spent = await limiter.peek({});
      expect(spent.allowed).toBe(false);
      expect(spent.failedRule).toBe('a');
      expect((await limiter.consume({})).allowed).toBe(false);
    });
  });
});
