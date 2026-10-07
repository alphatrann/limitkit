import { Pool } from 'pg';
import {
  initSchema,
  PostgresStore,
  fixedWindow,
  gcra,
  leakyBucket,
  slidingWindow,
  slidingWindowCounter,
  tokenBucket,
} from '../src';

const now = 1_000_000;
const LIMIT = 10;

const algorithms: ReadonlyArray<readonly [string, () => any]> = [
  ['FixedWindow', () => fixedWindow({ limit: LIMIT, window: 60 })],
  ['SlidingWindow', () => slidingWindow({ limit: LIMIT, window: 60 })],
  [
    'SlidingWindowCounter',
    () => slidingWindowCounter({ limit: LIMIT, window: 60 }),
  ],
  ['TokenBucket', () => tokenBucket({ capacity: LIMIT, refillRate: 0.001 })],
  ['LeakyBucket', () => leakyBucket({ capacity: LIMIT, leakRate: 0.001 })],
  ['GCRA', () => gcra({ burst: LIMIT, interval: 1000 })],
];

/**
 * Fire 3x the quota in consumes with a peek interleaved after each one, all
 * without awaiting in between, so they genuinely overlap on the store.
 */
async function hammer(store: any, make: () => any) {
  const algo = make();
  const calls: Promise<any>[] = [];
  for (let i = 0; i < LIMIT * 3; i++) {
    calls.push(store.consume('k', algo, now).then((r: any) => ['consume', r]));
    calls.push(store.peek('k', algo, now).then((r: any) => ['peek', r]));
  }
  const settled = await Promise.all(calls);
  return {
    algo,
    consumes: settled.filter(([t]) => t === 'consume').map(([, r]) => r),
    peeks: settled.filter(([t]) => t === 'peek').map(([, r]) => r),
  };
}

function expectQuotaIntact({ consumes, peeks }: any) {
  // Peeks must never draw quota down: exactly LIMIT consumes win.
  expect(consumes.filter((r: any) => r.allowed)).toHaveLength(LIMIT);
  // Every peek is a coherent snapshot, never an error or an out-of-range value.
  for (const p of peeks) {
    expect(p.remaining).toBeGreaterThanOrEqual(0);
    expect(p.remaining).toBeLessThanOrEqual(LIMIT - 1);
    if (!p.allowed) expect(p.remaining).toBe(0);
  }
}

describe('PostgresStore concurrent peek', () => {
  let pool: Pool;
  let store: PostgresStore;

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

  describe.each(algorithms)('concurrent consume + peek (%s)', (_name, make) => {
    it('keeps the quota exact while peeks overlap consumes', async () => {
      const run = await hammer(store, make);

      expectQuotaIntact(run);
      // Once the dust settles, peek and consume agree the quota is spent.
      const final = await store.peek('k', run.algo, now);
      expect(final.allowed).toBe(false);
      expect((await store.consume('k', run.algo, now)).allowed).toBe(false);
    });

    it('a burst of peeks alone leaves the full quota available', async () => {
      const algo = make();
      await Promise.all(
        Array.from({ length: 50 }, () => store.peek('k', algo, now)),
      );

      const results = await Promise.all(
        Array.from({ length: LIMIT }, () => store.consume('k', algo, now)),
      );
      expect(results.every((r: any) => r.allowed)).toBe(true);
    });
  });
});
