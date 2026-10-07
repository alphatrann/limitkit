import { RateLimiter } from '@limitkit/core';
import { Pool } from 'pg';
import {
  fixedWindow,
  gcra,
  initSchema,
  leakyBucket,
  PostgresStore,
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

describe('PostgresStore.peek', () => {
  let pool: Pool;
  let store: PostgresStore;

  const count = async (table: string) =>
    Number(
      (await pool.query(`SELECT count(*) AS n FROM limitkit.${table}`)).rows[0]
        .n,
    );

  beforeAll(async () => {
    pool = new Pool({
      host: process.env.POSTGRES_HOST ?? 'localhost',
      port: Number(process.env.POSTGRES_PORT ?? 5432),
      user: 'limitkit',
      password: 'limitkit',
      database: 'limitkit',
    });
    await initSchema(pool);
    store = new PostgresStore(pool);
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE limitkit.rate_limit_state CASCADE');
  });

  afterAll(async () => {
    await pool.end();
  });

  describe.each(algorithms)('%s', (_name, make) => {
    it('creates no rows for an unseen key', async () => {
      const peeked = await store.peek('k', make(), now);

      expect(peeked.allowed).toBe(true);
      expect(await count('rate_limit_state')).toBe(0);
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
  });

  describe('SlidingWindow log', () => {
    it('deletes no expired rows and inserts none', async () => {
      const algo = slidingWindow({ limit: 5, window: 10 });
      await store.consume('k', algo, now, 2);

      await store.peek('k', algo, now + 1_000);
      await store.peek('k', algo, now + 60_000); // everything expired by then

      expect(await count('sliding_window_log')).toBe(1);
      expect((await store.peek('k', algo, now + 60_000, 5)).allowed).toBe(true);
    });

    it('a zero-cost consume leaves no row behind', async () => {
      const algo = slidingWindow({ limit: 5, window: 10 });

      await store.consume('k', algo, now, 0);

      expect(await count('sliding_window_log')).toBe(0);
    });
  });

  const untouched = async () => (await count('rate_limit_state')) === 0;

  describe('RateLimiter.peek end to end', () => {
    const makeLimiter = () =>
      new RateLimiter({
        store,
        rules: [
          {
            name: 'a',
            key: 'e2e',
            policy: slidingWindow({ limit: 3, window: 60 }),
          },
          {
            name: 'b',
            key: 'e2e',
            policy: fixedWindow({ limit: 2, window: 60 }),
          },
        ],
      });

    it('reads real state without drawing it down, and agrees with consume', async () => {
      const limiter = makeLimiter();

      const fresh = await limiter.peek({});
      expect(fresh.allowed).toBe(true);
      expect(fresh.rules.map((r) => r.remaining)).toEqual([2, 1]);
      expect(await untouched()).toBe(true);

      expect((await limiter.consume({})).allowed).toBe(true);
      const afterOne = await limiter.peek({});
      expect(afterOne.rules.map((r) => r.remaining)).toEqual([1, 0]);
      // resetAt of a hypothetical sliding-window entry moves with the wall clock,
      // so compare the quota, not the timestamps.
      const again = await limiter.peek({});
      expect(again.rules.map((r) => r.remaining)).toEqual(
        afterOne.rules.map((r) => r.remaining),
      );

      expect((await limiter.consume({})).allowed).toBe(true);

      // rule b is now spent: peek reports it, still evaluates rule a, and
      // changes nothing no matter how often it is called.
      for (let i = 0; i < 3; i++) {
        const spent = await limiter.peek({});
        expect(spent.allowed).toBe(false);
        expect(spent.failedRule).toBe('b');
        expect(spent.rules.map((r) => r.name)).toEqual(['a', 'b']);
      }

      const rejected = await limiter.consume({});
      expect(rejected.allowed).toBe(false);
      expect(rejected.failedRule).toBe('b');
    });

    it('emits peek events to observers, not consume events', async () => {
      const limiter = makeLimiter();
      const names: string[] = [];
      limiter.subscribe({
        onPeekStart: () => names.push('peek.start'),
        onPeekAllow: () => names.push('peek.allow'),
        onConsumeStart: () => names.push('consume.start'),
        onRuleStart: () => names.push('rule.start'),
      });

      await limiter.peek({});

      expect(names).toEqual(['peek.start', 'peek.allow']);
    });
  });
});
