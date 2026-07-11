import { Pool } from 'pg';
import { fixedWindow, initSchema, PostgresStore, pruneOlderThan } from '../src';

describe('schema', () => {
  let pool: Pool;

  beforeAll(() => {
    pool = new Pool({
      host: process.env.POSTGRES_HOST ?? 'localhost',
      port: Number(process.env.POSTGRES_PORT ?? 5432),
      user: 'limitkit',
      password: 'limitkit',
      database: 'limitkit',
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  it('initSchema is idempotent (safe to run twice)', async () => {
    await initSchema(pool);
    await expect(initSchema(pool)).resolves.not.toThrow();

    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'limitkit' ORDER BY table_name`,
    );

    const tableNames = rows.map((r) => r.table_name);
    expect(tableNames).toEqual(
      expect.arrayContaining([
        'rate_limit_state',
        'token_bucket_state',
        'fixed_window_state',
        'sliding_window_counter_state',
        'leaky_bucket_state',
        'shaping_leaky_bucket_state',
        'gcra_state',
        'sliding_window_log',
        'custom_state',
      ]),
    );
  });

  it('rejects invalid schema names', async () => {
    await expect(initSchema(pool, 'bad; schema')).rejects.toThrow();
  });

  describe('pruneOlderThan', () => {
    beforeEach(async () => {
      await initSchema(pool);
      await pool.query('TRUNCATE limitkit.rate_limit_state CASCADE');
    });

    it('deletes anchor rows (and cascades to children) older than the cutoff', async () => {
      const store = new PostgresStore(pool);
      const limiter = fixedWindow({ window: 60, limit: 10 });

      await store.consume('stale-key', limiter, Date.now());

      await pool.query(
        "UPDATE limitkit.rate_limit_state SET updated_at = now() - interval '2 days' WHERE key = $1",
        ['stale-key'],
      );

      const deleted = await pruneOlderThan(pool, 24 * 60 * 60 * 1000);
      expect(deleted).toBe(1);

      const { rows } = await pool.query(
        'SELECT count(*)::int AS count FROM limitkit.rate_limit_state WHERE key = $1',
        ['stale-key'],
      );
      expect(rows[0].count).toBe(0);

      const { rows: childRows } = await pool.query(
        'SELECT count(*)::int AS count FROM limitkit.fixed_window_state',
      );
      expect(childRows[0].count).toBe(0);
    });

    it('keeps anchor rows updated more recently than the cutoff', async () => {
      const store = new PostgresStore(pool);
      const limiter = fixedWindow({ window: 60, limit: 10 });

      await store.consume('fresh-key', limiter, Date.now());

      const deleted = await pruneOlderThan(pool, 24 * 60 * 60 * 1000);
      expect(deleted).toBe(0);

      const { rows } = await pool.query(
        'SELECT count(*)::int AS count FROM limitkit.rate_limit_state WHERE key = $1',
        ['fresh-key'],
      );
      expect(rows[0].count).toBe(1);
    });
  });
});
