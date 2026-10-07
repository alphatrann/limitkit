import { createClient, RedisClientType } from 'redis';
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

describe('RedisStore.peek', () => {
  let redis: RedisClientType;
  let store: RedisStore;

  beforeAll(async () => {
    redis = createClient();
    await redis.connect();
    store = new RedisStore(redis);
  });

  beforeEach(async () => {
    await redis.flushDb();
  });

  afterAll(async () => {
    await redis.flushAll();
    await redis.quit();
  });

  describe.each(algorithms)('%s', (_name, make) => {
    it('creates no key for an unseen key', async () => {
      const peeked = await store.peek('k', make(), now);

      expect(peeked.allowed).toBe(true);
      expect(await redis.keys('*')).toEqual([]);
    });

    it('reports exactly what the next consume would, without changing it', async () => {
      const algo = make();
      for (let i = 0; i < 3; i++) await store.consume('k', algo, now);

      const first = await store.peek('k', algo, now);
      const second = await store.peek('k', algo, now);
      const consumed = await store.consume('k', algo, now);

      expect(second).toEqual(first);
      expect(consumed).toEqual(first);
    });

    it('reports a rejection once the quota is spent, and stays rejected', async () => {
      const algo = make();
      for (let i = 0; i < 5; i++) await store.consume('k', algo, now);

      const first = await store.peek('k', algo, now);
      const second = await store.peek('k', algo, now);

      expect(first.allowed).toBe(false);
      expect(second).toEqual(first);
      expect(await store.consume('k', algo, now)).toEqual(first);
    });

    it('does not write or refresh anything on an existing key', async () => {
      const algo = make();
      await store.consume('k', algo, now);
      const keys = await redis.keys('*');
      const dump = async () =>
        Promise.all(
          keys.map(async (k) => [k, await redis.dump(k), await redis.pTTL(k)]),
        );
      const before = await dump();

      await store.peek('k', algo, now + 500);

      const after = await dump();
      expect(after.map(([k, d]) => [k, d])).toEqual(
        before.map(([k, d]) => [k, d]),
      );
      // TTLs only ever count down; a refresh would push them back up.
      after.forEach(([, , ttl], i) =>
        expect(ttl as number).toBeLessThanOrEqual(before[i][2] as number),
      );
    });
  });

  describe('SlidingWindow log', () => {
    it('evicts nothing and adds no member', async () => {
      const algo = slidingWindow({ limit: 5, window: 10 });
      await store.consume('k', algo, now, 2);

      await store.peek('k', algo, now + 1_000);
      await store.peek('k', algo, now + 60_000); // everything expired by then

      expect(await redis.zCard('k')).toBe(2);
      // expired entries are ignored, so a peek then sees an empty window
      expect((await store.peek('k', algo, now + 60_000, 5)).allowed).toBe(true);
    });
  });
});
