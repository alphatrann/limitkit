import { Pool } from "pg";
import { Algorithm, LeakyBucketConfig } from "@limitkit/core";
import {
  initSchema,
  PostgresCompatible,
  PostgresStore,
  shapingLeakyBucket,
} from "../src";

describe("PostgresShapingLeakyBucket", () => {
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

    limiter = shapingLeakyBucket({ capacity: CAPACITY, leakRate: LEAK_RATE });
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE limitkit.rate_limit_state CASCADE");
  });

  afterAll(async () => {
    await pool.end();
  });

  it("should allow requests until capacity is reached", async () => {
    const key = "slb-allow";
    const now = 1_000_000;

    for (let i = 1; i <= CAPACITY; i++) {
      const result = await store.consume(key, limiter, now);
      expect(result.allowed).toBe(true);
      expect(result.availableAt).toBeDefined();
    }
  });

  it("should reject when capacity is exceeded", async () => {
    const key = "slb-full";
    const now = 1_000_000;

    for (let i = 0; i < CAPACITY; i++) {
      await store.consume(key, limiter, now);
    }

    const result = await store.consume(key, limiter, now);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("availableAt should schedule requests sequentially", async () => {
    const key = "slb-schedule";
    const now = 1_000_000;

    const first = await store.consume(key, limiter, now);
    const second = await store.consume(key, limiter, now);

    expect(second.availableAt).toBeGreaterThan(first.availableAt!);
  });

  it("should not exceed capacity under concurrency", async () => {
    const key = "slb-concurrency";
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
