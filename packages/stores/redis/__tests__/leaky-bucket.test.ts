import { createClient, RedisClientType } from "redis";
import { RedisCompatible, RedisLeakyBucket, RedisStore } from "../src";
import { Algorithm, LeakyBucketConfig } from "@limitkit/core";

describe("RedisLeakyBucket", () => {
  const CAPACITY = 5;
  const LEAK_RATE = 1; // per second

  let redis: RedisClientType;
  let store: RedisStore;
  let limiter: Algorithm<LeakyBucketConfig> & RedisCompatible;

  beforeAll(async () => {
    redis = createClient({ url: "redis://localhost:6379/1" });
    await redis.connect();

    store = new RedisStore(redis);

    limiter = new RedisLeakyBucket({
      name: "leaky-bucket",
      capacity: CAPACITY,
      leakRate: LEAK_RATE,
    });
  });

  beforeEach(async () => {
    await redis.flushDb();
  });

  afterAll(async () => {
    await redis.flushAll();
    await redis.quit();
  });

  it("should allow requests until capacity is reached", async () => {
    const key = "lb-allow";
    const now = 1_000_000;

    for (let i = 1; i <= CAPACITY; i++) {
      const result = await store.consume(key, limiter, now);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(CAPACITY - i);
      expect(result.retryAfter).toBe(0);
    }
  });

  it("should reject when queue is full", async () => {
    const key = "lb-full";
    const now = 1_000_000;

    for (let i = 0; i < CAPACITY; i++) {
      await store.consume(key, limiter, now);
    }

    const result = await store.consume(key, limiter, now);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it("should leak requests over time", async () => {
    const key = "lb-leak";
    const now = 1_000_000;

    for (let i = 0; i < CAPACITY; i++) {
      await store.consume(key, limiter, now);
    }

    const later = now + 2000;

    const result = await store.consume(key, limiter, later);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeLessThan(CAPACITY);
  });

  it("cost should add multiple items to queue", async () => {
    const key = "lb-cost";
    const now = 1_000_000;

    const result = await store.consume(key, limiter, now, 3);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(CAPACITY - 3);
  });

  it("should reject when cost exceeds capacity", async () => {
    const key = "lb-cost-reject";
    const now = 1_000_000;

    await store.consume(key, limiter, now, CAPACITY - 1);

    const result = await store.consume(key, limiter, now, 2);

    expect(result.allowed).toBe(false);
  });

  it("reset should represent time until queue empties", async () => {
    const key = "lb-reset";
    const now = 1_000_000;

    await store.consume(key, limiter, now, 2);

    const result = await store.consume(key, limiter, now);

    expect(result.reset).toBeGreaterThan(now);
  });

  it("reset should equal queue drain time", async () => {
    const key = "lb-reset-exact";
    const now = 1_000_000;

    await store.consume(key, limiter, now, 2);

    const result = await store.consume(key, limiter, now);

    const expectedReset = now + (3 / LEAK_RATE) * 1000;

    expect(result.reset).toBeLessThanOrEqual(expectedReset);
  });

  it("retryAfter should reflect time until queue has space", async () => {
    const key = "lb-retry-after";
    const now = 1_000_000;

    await store.consume(key, limiter, now, CAPACITY);

    const result = await store.consume(key, limiter, now);

    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
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

  it("should handle concurrent cost correctly", async () => {
    const key = "lb-concurrency-cost";
    const now = 1_000_000;

    const results = await Promise.all(
      Array.from({ length: 10 }).map(() => store.consume(key, limiter, now, 2)),
    );

    const allowed = results.filter((r) => r.allowed).length;

    expect(allowed).toBeLessThanOrEqual(Math.floor(CAPACITY / 2));
  });

  it("should gradually free capacity as queue leaks", async () => {
    const key = "lb-gradual";
    const now = 1_000_000;

    await store.consume(key, limiter, now, CAPACITY);

    const halfway = now + 2000;

    const result = await store.consume(key, limiter, halfway);

    expect(result.allowed).toBe(true);
  });

  it("should empty queue after long idle", async () => {
    const key = "lb-idle";
    const now = 1_000_000;

    await store.consume(key, limiter, now, CAPACITY);

    const later = now + 60_000;

    const result = await store.consume(key, limiter, later);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(CAPACITY - 1);
  });
});
