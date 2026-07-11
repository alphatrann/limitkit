import { Pool } from "pg";
import { Algorithm, LeakyBucketConfig } from "@limitkit/core";
import { initSchema, leakyBucket, PostgresCompatible, PostgresStore } from "../src";

describe("PostgresLeakyBucket", () => {
  const CAPACITY = 5;
  const LEAK_RATE = 1; // requests per second

  let pool: Pool;
  let store: PostgresStore;
  let limiter: Algorithm<LeakyBucketConfig> & PostgresCompatible<any>;

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

    limiter = leakyBucket({ capacity: CAPACITY, leakRate: LEAK_RATE });
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE limitkit.rate_limit_state CASCADE");
  });

  afterAll(async () => {
    await pool.end();
  });

  it("should allow requests until capacity is reached", async () => {
    const key = "lb-allow";
    const now = 1_000_000;

    for (let i = 1; i <= CAPACITY; i++) {
      const result = await store.consume(key, limiter, now);
      expect(result.allowed).toBe(true);
    }
  });

  it("should reject when bucket is full", async () => {
    const key = "lb-full";
    const now = 1_000_000;

    for (let i = 0; i < CAPACITY; i++) {
      await store.consume(key, limiter, now);
    }

    const result = await store.consume(key, limiter, now);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("should leak over time", async () => {
    const key = "lb-leak";
    const now = 1_000_000;

    for (let i = 0; i < CAPACITY; i++) {
      await store.consume(key, limiter, now);
    }

    const later = now + 3000;

    const result = await store.consume(key, limiter, later);

    expect(result.allowed).toBe(true);
  });

  it("cost should consume multiple slots", async () => {
    const key = "lb-cost";
    const now = 1_000_000;

    const result = await store.consume(key, limiter, now, 3);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(CAPACITY - 3);
  });

  it("should not exceed capacity under concurrency", async () => {
    const key = "lb-concurrency";
    const now = 1_000_000;

    const concurrency = 50;

    const results = await Promise.all(
      Array.from({ length: concurrency }).map(() =>
        store.consume(key, limiter, now),
      ),
    );

    const allowed = results.filter((r) => r.allowed).length;

    expect(allowed).toBe(CAPACITY);
  });
});
