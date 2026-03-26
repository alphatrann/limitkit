import { createClient, RedisClientType } from "redis";
import { RedisStore, RedisCompatible, slidingWindowCounter } from "../src";

import { Algorithm, SlidingWindowCounterConfig } from "@limitkit/core";

describe("RedisSlidingWindowCounter", () => {
  const WINDOW = 5;
  const LIMIT = 5;

  let redis: RedisClientType;
  let store: RedisStore;
  let limiter: Algorithm<SlidingWindowCounterConfig> & RedisCompatible;

  beforeAll(async () => {
    redis = createClient();
    await redis.connect();
    await redis.scriptFlush();

    store = new RedisStore(redis);

    limiter = slidingWindowCounter({
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
    const key = "swc-allow";
    const now = 1_000_000;

    for (let i = 1; i <= LIMIT; i++) {
      const result = await store.consume(key, limiter, now);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(LIMIT - i);
      expect(result.limit).toBe(LIMIT);
      expect(result.availableAt).toBeUndefined();
    }
  });

  it("should reject requests after limit is exceeded", async () => {
    const key = "swc-exceed";
    const now = 1_000_000;

    for (let i = 0; i < LIMIT; i++) {
      await store.consume(key, limiter, now + i * 200);
    }

    const result = await store.consume(key, limiter, now + LIMIT * 200);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.limit).toBe(LIMIT);

    expect(result.availableAt).toBe(now + WINDOW * 1000);
    expect(result.resetAt).toBe(WINDOW * 2000 + now);
  });

  it("should reset after enough time passes", async () => {
    const key = "swc-reset";
    const now = 1_000_000;

    for (let i = 0; i < LIMIT; i++) {
      await store.consume(key, limiter, now);
    }

    const later = now + WINDOW * 2000;

    const result = await store.consume(key, limiter, later);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(LIMIT - 1);
  });

  it("should partially decay previous window", async () => {
    const key = "swc-decay";
    const now = 1_000_000;

    for (let i = 0; i < LIMIT; i++) {
      await store.consume(key, limiter, now);
    }

    const halfway = now + WINDOW * 500;

    const result = await store.consume(key, limiter, halfway);

    // previous window should partially count
    expect(result.allowed).toBe(false);
  });

  it("availableAt should match next window boundary", async () => {
    const key = "swc-retry-after";
    const now = 1_000_000;

    for (let i = 0; i < LIMIT; i++) {
      await store.consume(key, limiter, now + i * 200);
    }

    const result = await store.consume(key, limiter, now + LIMIT * 200);

    const expectedRetry = now + WINDOW * 1000;

    expect(result.availableAt).toBeLessThanOrEqual(expectedRetry);
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

    expect(allowed).toBeLessThanOrEqual(LIMIT);
  });

  it("should handle concurrent cost consumption", async () => {
    const key = "swc-concurrency-cost";
    const now = 1_000_000;

    const concurrency = 10;

    const results = await Promise.all(
      Array.from({ length: concurrency }).map(() =>
        store.consume(key, limiter, now, 2),
      ),
    );

    const allowed = results.filter((r) => r.allowed).length;

    expect(allowed).toBeLessThanOrEqual(Math.floor(LIMIT / 2));
  });

  it("should smooth burst across window boundary", async () => {
    const key = "swc-boundary";
    const base = 1_000_000;

    const endOfWindow = base + WINDOW * 1000 - 1;

    for (let i = 0; i < LIMIT; i++) {
      await store.consume(key, limiter, endOfWindow);
    }

    const startNextWindow = endOfWindow + 1;

    const result = await store.consume(key, limiter, startNextWindow);

    expect(result.allowed).toBe(false);
  });

  it("should handle multiple windows passing", async () => {
    const key = "swc-multi-window";
    const now = 1_000_000;

    await store.consume(key, limiter, now);

    const muchLater = now + WINDOW * 1000 * 5;

    const result = await store.consume(key, limiter, muchLater);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(LIMIT - 1);
  });
});
