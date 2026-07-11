import { Pool } from "pg";
import { Algorithm, SlidingWindowConfig } from "@limitkit/core";
import {
  initSchema,
  PostgresLogCompatible,
  PostgresStore,
  slidingWindow,
} from "../src";

describe("PostgresSlidingWindow", () => {
  const WINDOW = 5;
  const LIMIT = 5;

  let pool: Pool;
  let store: PostgresStore;
  let limiter: Algorithm<SlidingWindowConfig> & PostgresLogCompatible;

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

    limiter = slidingWindow({ window: WINDOW, limit: LIMIT });
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE limitkit.rate_limit_state CASCADE");
  });

  afterAll(async () => {
    await pool.end();
  });

  it("should allow requests until limit is reached", async () => {
    const key = "sliding-allow";
    const now = 1_000_000;

    for (let i = 1; i <= LIMIT; i++) {
      const result = await store.consume(key, limiter, now);

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(LIMIT);
      expect(result.remaining).toBe(LIMIT - i);
      expect(result.availableAt).toBeUndefined();
    }
  });

  it("should reject requests after limit is exceeded", async () => {
    const key = "sliding-exceed";
    const now = 1_000_000;

    for (let i = 0; i < LIMIT; i++) {
      await store.consume(key, limiter, now + i * 500);
    }

    const result = await store.consume(key, limiter, now + LIMIT * 500);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.limit).toBe(LIMIT);

    expect(result.availableAt).toBe(now + WINDOW * 1000);
    expect(result.resetAt).toBe(now + (LIMIT - 1) * 500 + WINDOW * 1000);
  });

  it("should allow requests again after window passes", async () => {
    const key = "sliding-reset";
    const now = 1_000_000;

    for (let i = 0; i < LIMIT; i++) {
      await store.consume(key, limiter, now + i * 500);
    }

    const afterWindow = now + LIMIT * 500 + WINDOW * 1000;

    const result = await store.consume(key, limiter, afterWindow);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(LIMIT - 1);
  });

  it("cost should consume multiple tokens", async () => {
    const key = "sliding-cost";
    const now = 1_000_000;

    const result = await store.consume(key, limiter, now, 3);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(LIMIT - 3);
  });

  it("should reject when cost exceeds remaining tokens", async () => {
    const key = "sliding-cost-reject";
    const now = 1_000_000;

    await store.consume(key, limiter, now, LIMIT - 1);

    const result = await store.consume(key, limiter, now, 2);

    expect(result.allowed).toBe(false);
  });

  it("should allow requests as old entries expire", async () => {
    const key = "sliding-partial-expire";
    const now = 1_000_000;

    for (let i = 0; i < LIMIT; i++) {
      await store.consume(key, limiter, now + i);
    }

    const later = now + WINDOW * 1000 + 1;

    const result = await store.consume(key, limiter, later);

    expect(result.allowed).toBe(true);
  });

  it("should not exceed limit under concurrency", async () => {
    const key = "sliding-concurrency";
    const now = 1_000_000;

    const concurrency = 50;

    const results = await Promise.all(
      Array.from({ length: concurrency }).map(() =>
        store.consume(key, limiter, now),
      ),
    );

    const allowed = results.filter((r) => r.allowed).length;

    expect(allowed).toBe(LIMIT);
  });
});
