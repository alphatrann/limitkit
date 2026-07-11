import { Pool } from "pg";
import { Algorithm, TokenBucketConfig } from "@limitkit/core";
import { initSchema, PostgresCompatible, PostgresStore, tokenBucket } from "../src";

describe("PostgresTokenBucket", () => {
  const CAPACITY = 5;
  const REFILL = 1; // tokens per second

  let pool: Pool;
  let store: PostgresStore;
  let limiter: Algorithm<TokenBucketConfig> & PostgresCompatible<any>;

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

    limiter = tokenBucket({ capacity: CAPACITY, refillRate: REFILL });
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE limitkit.rate_limit_state CASCADE");
  });

  afterAll(async () => {
    await pool.end();
  });

  it("should allow requests until capacity is reached", async () => {
    const key = "tb-allow";
    const now = 1_000_000;

    for (let i = 1; i <= CAPACITY; i++) {
      const result = await store.consume(key, limiter, now);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(CAPACITY - i);
      expect(result.limit).toBe(CAPACITY);
      expect(result.availableAt).toBeUndefined();
    }
  });

  it("should reject when bucket is empty", async () => {
    const key = "tb-empty";
    const now = 1_000_000;

    for (let i = 0; i < CAPACITY; i++) {
      await store.consume(key, limiter, now);
    }

    const result = await store.consume(key, limiter, now);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.availableAt).toBe(now + Math.ceil((1 / REFILL) * 1000));
  });

  it("should refill tokens over time", async () => {
    const key = "tb-refill";
    const now = 1_000_000;

    for (let i = 0; i < CAPACITY; i++) {
      await store.consume(key, limiter, now);
    }

    const later = now + 3000; // 3 seconds

    const result = await store.consume(key, limiter, later);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it("should not exceed capacity when refilling", async () => {
    const key = "tb-cap";
    const now = 1_000_000;

    const later = now + 60_000;

    const result = await store.consume(key, limiter, later);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(CAPACITY - 1);
  });

  it("cost should consume multiple tokens", async () => {
    const key = "tb-cost";
    const now = 1_000_000;

    const result = await store.consume(key, limiter, now, 3);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(CAPACITY - 3);
  });

  it("should reject when cost exceeds tokens", async () => {
    const key = "tb-cost-reject";
    const now = 1_000_000;

    await store.consume(key, limiter, now, CAPACITY - 1);

    const result = await store.consume(key, limiter, now, 2);

    expect(result.allowed).toBe(false);
  });

  it("should not exceed capacity under concurrency", async () => {
    const key = "tb-concurrency";
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

  it("availableAt should match token refill time", async () => {
    const key = "tb-retry-after";
    const now = 1_000_000;

    await store.consume(key, limiter, now, CAPACITY);

    const result = await store.consume(key, limiter, now);

    const expectedRetry = now + Math.ceil((1 / REFILL) * 1000);

    expect(result.allowed).toBe(false);
    expect(result.availableAt).toBe(expectedRetry);
  });
});
