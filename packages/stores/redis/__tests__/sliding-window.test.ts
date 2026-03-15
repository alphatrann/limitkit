import { createClient, RedisClientType } from "redis";
import { RedisStore, RedisSlidingWindow, RedisCompatible } from "../src";
import { Algorithm, SlidingWindowConfig } from "@limitkit/core";

describe("RedisSlidingWindow", () => {
  const WINDOW = 5;
  const LIMIT = 5;

  let redis: RedisClientType;
  let store: RedisStore;
  let limiter: Algorithm<SlidingWindowConfig> & RedisCompatible;

  beforeAll(async () => {
    redis = createClient();
    await redis.connect();
    await redis.scriptFlush();

    store = new RedisStore(redis);

    limiter = new RedisSlidingWindow({
      name: "sliding-window",
      window: WINDOW,
      limit: LIMIT,
    });
  });

  beforeEach(async () => {
    await redis.flushDb();
  });

  afterAll(async () => {
    await redis.flushAll();
    await redis.quit();
  });

  it("should allow requests until limit is reached", async () => {
    const key = "sliding-allow";
    const now = 1_000_000;

    for (let i = 1; i <= LIMIT; i++) {
      const result = await store.consume(key, limiter, now);

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(LIMIT);
      expect(result.remaining).toBe(LIMIT - i);
      expect(result.retryAfter).toBe(0);
    }
  });

  it("should reject requests after limit is exceeded", async () => {
    const key = "sliding-exceed";
    const now = 1_000_000;

    for (let i = 0; i < LIMIT; i++) {
      await store.consume(key, limiter, now);
    }

    const result = await store.consume(key, limiter, now);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.limit).toBe(LIMIT);

    expect(result.retryAfter).toBeGreaterThanOrEqual(0);
    expect(result.reset).toBeGreaterThan(now);
  });

  it("should allow requests again after window passes", async () => {
    const key = "sliding-reset";
    const now = 1_000_000;

    for (let i = 0; i < LIMIT; i++) {
      await store.consume(key, limiter, now + i);
    }

    const afterWindow = now + WINDOW * 1000 + 10;

    const result = await store.consume(key, limiter, afterWindow);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(LIMIT - 1);
  });

  it("reset timestamp should match newest event expiration", async () => {
    const key = "sliding-reset-timestamp";
    const now = 1_000_000;

    await store.consume(key, limiter, now);

    const result = await store.consume(key, limiter, now + 1000);

    expect(result.reset).toBe(now + 1000 + WINDOW * 1000);
  });

  it("retryAfter should match reset timestamp", async () => {
    const key = "sliding-retry-after";
    const now = 1_000_000;

    for (let i = 0; i < LIMIT; i++) {
      await store.consume(key, limiter, now + i * 500);
    }

    const result = await store.consume(key, limiter, now + LIMIT * 500);

    const expectedRetry = Math.ceil((LIMIT * 500) / 1000);

    expect(result.retryAfter).toBe(expectedRetry);
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
