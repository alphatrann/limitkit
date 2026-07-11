import { Pool } from "pg";
import { fixedWindow, initSchema, PostgresStore } from "../src";

describe("PostgresStore", () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({
      host: process.env.POSTGRES_HOST ?? "localhost",
      port: Number(process.env.POSTGRES_PORT ?? 5432),
      user: "limitkit",
      password: "limitkit",
      database: "limitkit",
    });
    await initSchema(pool);
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE limitkit.rate_limit_state CASCADE");
  });

  afterAll(async () => {
    await pool.end();
  });

  it("rejects invalid schema names at construction time", () => {
    expect(() => new PostgresStore(pool, "limitkit; DROP TABLE users")).toThrow();
    expect(() => new PostgresStore(pool, "1invalid")).toThrow();
    expect(() => new PostgresStore(pool, "")).toThrow();
  });

  it("accepts a valid custom schema name", async () => {
    const customPool = new Pool({
      host: process.env.POSTGRES_HOST ?? "localhost",
      port: Number(process.env.POSTGRES_PORT ?? 5432),
      user: "limitkit",
      password: "limitkit",
      database: "limitkit",
    });

    try {
      await initSchema(customPool, "limitkit_custom");
      const store = new PostgresStore(customPool, "limitkit_custom");
      const limiter = fixedWindow({ window: 60, limit: 10 });

      const result = await store.consume("custom-schema-key", limiter, Date.now());
      expect(result.allowed).toBe(true);

      await customPool.query('DROP SCHEMA IF EXISTS "limitkit_custom" CASCADE');
    } finally {
      await customPool.end();
    }
  });

  it("creates a fresh anchor row on first consume and reuses it afterwards", async () => {
    const store = new PostgresStore(pool);
    const limiter = fixedWindow({ window: 60, limit: 10 });
    const key = "anchor-reuse";

    await store.consume(key, limiter, 1_000_000);
    await store.consume(key, limiter, 1_000_100);

    const { rows } = await pool.query(
      "SELECT count(*)::int AS count FROM limitkit.rate_limit_state WHERE key = $1",
      [key],
    );

    expect(rows[0].count).toBe(1);
  });

  it("releases the client back to the pool after consume", async () => {
    const store = new PostgresStore(pool);
    const limiter = fixedWindow({ window: 60, limit: 10 });

    await store.consume("release-check", limiter, Date.now());

    expect(pool.idleCount).toBeGreaterThan(0);
    expect(pool.totalCount - pool.idleCount).toBe(0);
  });

  it("rolls back and rethrows when cost exceeds the limit", async () => {
    const store = new PostgresStore(pool);
    const limiter = fixedWindow({ window: 60, limit: 5 });

    await expect(
      store.consume("bad-cost", limiter, Date.now(), 10),
    ).rejects.toThrow();

    const { rows } = await pool.query(
      "SELECT count(*)::int AS count FROM limitkit.rate_limit_state WHERE key = $1",
      ["bad-cost"],
    );

    expect(rows[0].count).toBe(0);
  });
});
