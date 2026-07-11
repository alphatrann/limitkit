import { Pool } from "pg";
import { Algorithm, GCRAConfig } from "@limitkit/core";
import { gcra, initSchema, PostgresCompatible, PostgresStore } from "../src";

describe("PostgresGCRA", () => {
  const BURST = 5;
  const INTERVAL = 1; // seconds between requests

  let pool: Pool;
  let store: PostgresStore;
  let limiter: Algorithm<GCRAConfig> & PostgresCompatible<any>;

  beforeAll(async () => {
    pool = new Pool({
      host: process.env.POSTGRES_HOST ?? "localhost",
      port: Number(process.env.POSTGRES_PORT ?? 5432),
      user: "limitkit",
      password: "limitkit",
      database: "limitkit",
    });
    await initSchema(pool);

    store = new PostgresStore(pool);

    limiter = gcra({ burst: BURST, interval: INTERVAL });
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE limitkit.rate_limit_state CASCADE");
  });

  afterAll(async () => {
    await pool.end();
  });

  it("should allow requests within burst", async () => {
    const key = "gcra-allow";
    const now = 1_000_000;

    for (let i = 0; i < BURST; i++) {
      const result = await store.consume(key, limiter, now);
      expect(result.allowed).toBe(true);
    }
  });

  it("should reject requests beyond burst", async () => {
    const key = "gcra-exceed";
    const now = 1_000_000;

    for (let i = 0; i < BURST; i++) {
      await store.consume(key, limiter, now);
    }

    const result = await store.consume(key, limiter, now);

    expect(result.allowed).toBe(false);
  });

  it("should allow again after interval passes", async () => {
    const key = "gcra-reset";
    const now = 1_000_000;

    for (let i = 0; i < BURST; i++) {
      await store.consume(key, limiter, now);
    }

    const later = now + INTERVAL * 1000;

    const result = await store.consume(key, limiter, later);

    expect(result.allowed).toBe(true);
  });

  it("should not exceed burst under concurrency", async () => {
    const key = "gcra-concurrency";
    const now = 1_000_000;

    const concurrency = 50;

    const results = await Promise.all(
      Array.from({ length: concurrency }).map(() =>
        store.consume(key, limiter, now),
      ),
    );

    const allowed = results.filter((r) => r.allowed).length;

    expect(allowed).toBe(BURST);
  });
});
