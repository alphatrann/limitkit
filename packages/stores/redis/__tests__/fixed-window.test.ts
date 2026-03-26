import { createClient, RedisClientType } from "redis";
import { RedisStore, RedisCompatible, fixedWindow } from "../src";
import { Algorithm, FixedWindowConfig } from "@limitkit/core";

describe("RedisFixedWindow", () => {
  const WINDOW = 5;
  const LIMIT = 5;

  let redis: RedisClientType;
  let store: RedisStore;
  let limiter: Algorithm<FixedWindowConfig> & RedisCompatible;

  beforeAll(async () => {
    redis = createClient();
    await redis.connect();
    await redis.scriptFlush();

    store = new RedisStore(redis);

    limiter = fixedWindow({
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

  it("availableAt should match reset timestamp", async () => {
    const key = "fixed-retry-after";
    const now = 1_000_000;

    for (let i = 0; i < LIMIT; i++) {
      await store.consume(key, limiter, now + i * 200);
    }

    const result = await store.consume(key, limiter, now + LIMIT * 200);

    expect(result.availableAt).toBe(result.resetAt);
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
