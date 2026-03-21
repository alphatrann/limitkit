import { createClient, RedisClientType } from "redis";
import { RedisStore, RedisCompatible, tokenBucket } from "../src";
import { Algorithm, TokenBucketConfig } from "@limitkit/core";

describe("RedisTokenBucket", () => {
  const CAPACITY = 5;
  const REFILL = 1; // tokens per second

  let redis: RedisClientType;
  let store: RedisStore;
  let limiter: Algorithm<TokenBucketConfig> & RedisCompatible;

  beforeAll(async () => {
    redis = createClient();
    await redis.connect();
    await redis.scriptFlush();

    store = new RedisStore(redis);

    limiter = tokenBucket({
      capacity: CAPACITY,
      refillRate: REFILL,
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
    const key = "tb-allow";
    const now = 1_000_000;

    for (let i = 1; i <= CAPACITY; i++) {
      const result = await store.consume(key, limiter, now);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(CAPACITY - i);
      expect(result.limit).toBe(CAPACITY);
      expect(result.retryAt).toBeUndefined();
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
    expect(result.retryAt).toBe(now + Math.ceil((1 / REFILL) * 1000));
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

  it("retryAt should match token refill time", async () => {
    const key = "tb-retry-after";
    const now = 1_000_000;

    // empty the bucket
    await store.consume(key, limiter, now, CAPACITY);

    const result = await store.consume(key, limiter, now);

    const expectedRetry = now + Math.ceil((1 / REFILL) * 1000);

    expect(result.allowed).toBe(false);
    expect(result.retryAt).toBe(expectedRetry);
  });

  it("resetAt should equal full refill time when bucket empty", async () => {
    const key = "tb-reset-empty";
    const now = 1_000_000;

    await store.consume(key, limiter, now, CAPACITY);

    const result = await store.consume(key, limiter, now);

    const expectedReset = now + (CAPACITY / REFILL) * 1000;

    expect(result.resetAt).toBeCloseTo(expectedReset, -2);
  });

  it("retryAt should scale with cost", async () => {
    const key = "tb-retry-after-cost";
    const now = 1_000_000;

    await store.consume(key, limiter, now, CAPACITY);

    const result = await store.consume(key, limiter, now, 3);

    const expectedRetry = now + Math.ceil((3 / REFILL) * 1000);

    expect(result.allowed).toBe(false);
    expect(result.retryAt).toBe(expectedRetry);
  });

  it("should handle concurrent cost consumption", async () => {
    const key = "tb-concurrency-cost";
    const now = 1_000_000;

    const concurrency = 10;

    const results = await Promise.all(
      Array.from({ length: concurrency }).map(() =>
        store.consume(key, limiter, now, 2),
      ),
    );

    const allowed = results.filter((r) => r.allowed).length;

    expect(allowed).toBeLessThanOrEqual(Math.floor(CAPACITY / 2));
  });

  it("should not allow when there's only half a token", async () => {
    const key = "tb-partial";
    const now = 1_000_000;

    await store.consume(key, limiter, now, CAPACITY);

    const halfSecond = now + 500;

    const result = await store.consume(key, limiter, halfSecond);

    expect(result.allowed).toBe(false);
  });
});
