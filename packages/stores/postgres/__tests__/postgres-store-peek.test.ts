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
});
