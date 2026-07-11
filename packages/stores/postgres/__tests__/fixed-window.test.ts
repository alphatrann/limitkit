import { Pool } from "pg";
import { Algorithm, FixedWindowConfig } from "@limitkit/core";
import { fixedWindow, initSchema, PostgresCompatible, PostgresStore } from "../src";

describe("PostgresFixedWindow", () => {
  const WINDOW = 5;
  const LIMIT = 5;

  let pool: Pool;
  let store: PostgresStore;
  let limiter: Algorithm<FixedWindowConfig> & PostgresCompatible<any>;

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

    limiter = fixedWindow({ window: WINDOW, limit: LIMIT });
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE limitkit.rate_limit_state CASCADE");
  });

  afterAll(async () => {
    await pool.end();
  });

  it("should allow requests until limit is reached", async () => {
    const key = "fixed-allow";
    const now = 1_000_000;

    for (let i = 1; i <= LIMIT; i++) {
      const result = await store.consume(key, limiter, now + i * 500);

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(LIMIT);
      expect(result.remaining).toBe(LIMIT - i);
      expect(result.availableAt).toBeUndefined();
    }
  });

  it("should reject requests after limit is exceeded", async () => {
    const key = "fixed-exceed";
    const now = 1_000_000;

    for (let i = 1; i <= LIMIT; i++) {
      await store.consume(key, limiter, now + i * 500);
    }

    const result = await store.consume(key, limiter, now);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.limit).toBe(LIMIT);

    expect(result.availableAt).toBe(now + WINDOW * 1000);
    expect(result.resetAt).toBe(result.availableAt);
  });

  it("should reset after window expires", async () => {
    const key = "fixed-reset";
    const now = 1_000_000;

    for (let i = 0; i < LIMIT; i++) {
      await store.consume(key, limiter, now + i);
    }

    const afterWindow = now + WINDOW * 1000 + 10;

    const result = await store.consume(key, limiter, afterWindow);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(LIMIT - 1);
    expect(result.limit).toBe(LIMIT);
  });

  it("reset timestamp should represent next window start", async () => {
    const key = "fixed-reset-timestamp";
    const now = 1_000_000;

    const result = await store.consume(key, limiter, now);

    const expectedWindowStart = now - (now % (WINDOW * 1000));
    const expectedReset = expectedWindowStart + WINDOW * 1000;

    expect(result.resetAt).toBe(expectedReset);
  });

  it("cost should consume multiple tokens", async () => {
    const key = "fixed-cost";
    const now = 1_000_000;

    const result = await store.consume(key, limiter, now, 3);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(LIMIT - 3);
  });

  it("should reject when cost exceeds remaining tokens", async () => {
    const key = "fixed-cost-reject";
    const now = 1_000_000;

    await store.consume(key, limiter, now, LIMIT - 1);

    const result = await store.consume(key, limiter, now, 2);

    expect(result.allowed).toBe(false);
  });

  it("should not allow more than limit under concurrency", async () => {
    const key = "fixed-concurrency";
    const now = 1_000_000;

    const concurrency = 50;

    const results = await Promise.all(
      Array.from({ length: concurrency }).map(() =>
        store.consume(key, limiter, now),
      ),
    );

    const allowed = results.filter((r) => r.allowed).length;
    const rejected = results.filter((r) => !r.allowed).length;

    expect(allowed).toBe(LIMIT);
    expect(rejected).toBe(concurrency - LIMIT);
  });

  it("should handle concurrent cost consumption correctly", async () => {
    const key = "fixed-concurrency-cost";
    const now = 1_000_000;

    const concurrency = 10;

    const results = await Promise.all(
      Array.from({ length: concurrency }).map(() =>
        store.consume(key, limiter, now, 2),
      ),
    );

    const allowed = results.filter((r) => r.allowed).length;

    const expectedAllowed = Math.floor(LIMIT / 2);

    expect(allowed).toBe(expectedAllowed);
  });
});
