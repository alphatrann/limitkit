import { createClient, RedisClientType } from "redis";
import { RedisStore, RedisTokenBucket, RedisCompatible } from "../src";
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

    limiter = new RedisTokenBucket({
      name: "token-bucket",
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
      expect(result.retryAfter).toBe(0);
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
    expect(result.retryAfter).toBeGreaterThan(0);
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
    expect(result.remaining).toBeLessThan(CAPACITY);
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

  it("retryAfter should match token refill time", async () => {
    const key = "tb-retry-after";
    const now = 1_000_000;

    // empty the bucket
    await store.consume(key, limiter, now, CAPACITY);

    const result = await store.consume(key, limiter, now);

    const expectedRetry = Math.ceil(1 / REFILL);

    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBe(expectedRetry);
  });

  it("reset should equal full refill time when bucket empty", async () => {
    const key = "tb-reset-empty";
    const now = 1_000_000;

    await store.consume(key, limiter, now, CAPACITY);

    const result = await store.consume(key, limiter, now);

    const expectedReset = now + (CAPACITY / REFILL) * 1000;

    expect(result.reset).toBeCloseTo(expectedReset, -2);
  });

  it("retryAfter should decrease as time passes", async () => {
    const key = "tb-retry-decrease";
    const now = 1_000_000;

    await store.consume(key, limiter, now, CAPACITY);

    const first = await store.consume(key, limiter, now);

    const later = await store.consume(key, limiter, now + 500);

    expect(later.retryAfter).toBeLessThanOrEqual(first.retryAfter!);
  });

  it("retryAfter should scale with cost", async () => {
    const key = "tb-retry-after-cost";
    const now = 1_000_000;

    await store.consume(key, limiter, now, CAPACITY);

    const result = await store.consume(key, limiter, now, 3);

    const expectedRetry = Math.ceil(3 / REFILL);

    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBe(expectedRetry);
  });

  it("reset should represent full bucket refill", async () => {
    const key = "tb-reset";
    const now = 1_000_000;

    await store.consume(key, limiter, now, 2);

    const result = await store.consume(key, limiter, now);

    const expectedReset =
      now + ((CAPACITY - (CAPACITY - 2 - 1)) / REFILL) * 1000;

    expect(result.reset).toBeGreaterThan(now);
    expect(result.reset).toBeLessThanOrEqual(expectedReset);
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

  it("should partially refill tokens", async () => {
    const key = "tb-partial";
    const now = 1_000_000;

    await store.consume(key, limiter, now, CAPACITY);

    const halfSecond = now + 500;

    const result = await store.consume(key, limiter, halfSecond);

    expect(result.allowed).toBe(false);
  });

  it("should allow exactly when enough tokens refill", async () => {
    const key = "tb-boundary";
    const now = 1_000_000;

    await store.consume(key, limiter, now, CAPACITY);

    const later = now + 1000;

    const result = await store.consume(key, limiter, later);

    expect(result.allowed).toBe(true);
  });

  it("should clamp refill to capacity after long idle", async () => {
    const key = "tb-idle";
    const now = 1_000_000;

    await store.consume(key, limiter, now);

    const later = now + 3600 * 1000;

    const result = await store.consume(key, limiter, later);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(CAPACITY - 1);
  });

  it("should allow burst up to capacity", async () => {
    const key = "tb-burst";
    const now = 1_000_000;

    const results = [];

    for (let i = 0; i < CAPACITY; i++) {
      results.push(await store.consume(key, limiter, now));
    }

    const allowed = results.filter((r) => r.allowed).length;

    expect(allowed).toBe(CAPACITY);
  });

  it("retryAfter should remain consistent under concurrency", async () => {
    const key = "tb-concurrency-retry";
    const now = 1_000_000;

    await store.consume(key, limiter, now, CAPACITY);

    const results = await Promise.all(
      Array.from({ length: 20 }).map(() => store.consume(key, limiter, now)),
    );

    const rejected = results.filter((r) => !r.allowed);

    rejected.forEach((r) => {
      expect(r.retryAfter).toBeGreaterThan(0);
    });
  });
});
