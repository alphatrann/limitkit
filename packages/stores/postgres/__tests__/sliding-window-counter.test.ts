import { Pool } from "pg";
import { Algorithm, SlidingWindowCounterConfig } from "@limitkit/core";
import {
  initSchema,
  PostgresCompatible,
  PostgresStore,
  slidingWindowCounter,
} from "../src";

describe("PostgresSlidingWindowCounter", () => {
  const WINDOW = 5;
  const LIMIT = 5;

  let pool: Pool;
  let store: PostgresStore;
  let limiter: Algorithm<SlidingWindowCounterConfig> & PostgresCompatible<any>;

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

    limiter = slidingWindowCounter({ window: WINDOW, limit: LIMIT });
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE limitkit.rate_limit_state CASCADE");
  });

  afterAll(async () => {
    await pool.end();
  });

  it("should allow requests until limit is reached", async () => {
    const key = "swc-allow";
    const now = 1_000_000;

    for (let i = 1; i <= LIMIT; i++) {
      const result = await store.consume(key, limiter, now);

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(LIMIT);
    }
  });

  it("should reject requests after limit is exceeded", async () => {
    const key = "swc-exceed";
    const now = 1_000_000;

    for (let i = 0; i < LIMIT; i++) {
      await store.consume(key, limiter, now);
    }

    const result = await store.consume(key, limiter, now);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("should allow requests again in the next window", async () => {
    const key = "swc-reset";
    const now = 1_000_000;

    for (let i = 0; i < LIMIT; i++) {
      await store.consume(key, limiter, now);
    }

    const nextWindow = now + WINDOW * 1000 * 2;

    const result = await store.consume(key, limiter, nextWindow);

    expect(result.allowed).toBe(true);
  });

  it("cost should consume multiple tokens", async () => {
    const key = "swc-cost";
    const now = 1_000_000;

    const result = await store.consume(key, limiter, now, 3);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(LIMIT - 3);
  });

  it("should reject when cost exceeds remaining tokens", async () => {
    const key = "swc-cost-reject";
    const now = 1_000_000;

    await store.consume(key, limiter, now, LIMIT - 1);

    const result = await store.consume(key, limiter, now, 2);

    expect(result.allowed).toBe(false);
  });

  it("should not exceed limit under concurrency", async () => {
    const key = "swc-concurrency";
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
