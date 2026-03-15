import { createClient, RedisClientType } from "redis";
import { RedisStore, RedisGCRA, RedisCompatible } from "../src";
import { Algorithm, GCRAConfig } from "@limitkit/core";

describe("RedisGCRA", () => {
  const BURST = 5;
  const INTERVAL = 1; // seconds

  let redis: RedisClientType;
  let store: RedisStore;
  let limiter: Algorithm<GCRAConfig> & RedisCompatible;

  beforeAll(async () => {
    redis = createClient();
    await redis.connect();
    await redis.scriptFlush();

    store = new RedisStore(redis);

    limiter = new RedisGCRA({
      name: "gcra",
      burst: BURST,
      interval: INTERVAL,
    });
  });

  beforeEach(async () => {
    await redis.flushDb();
  });

  afterAll(async () => {
    await redis.flushAll();
    await redis.quit();
  });

  it("should allow requests up to burst capacity", async () => {
    const key = "gcra-burst";
    const now = 1_000_000;

    for (let i = 1; i <= BURST; i++) {
      const result = await store.consume(key, limiter, now);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(BURST - i);
      expect(result.retryAfter).toBe(0);
    }
  });

  it("should reject requests exceeding burst", async () => {
    const key = "gcra-exceed";
    const now = 1_000_000;

    for (let i = 0; i < BURST; i++) {
      await store.consume(key, limiter, now);
    }

    const result = await store.consume(key, limiter, now);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it("should allow request after interval passes", async () => {
    const key = "gcra-refill";
    const now = 1_000_000;

    for (let i = 0; i < BURST; i++) {
      await store.consume(key, limiter, now);
    }

    const later = now + INTERVAL * 1000;

    const result = await store.consume(key, limiter, later);

    expect(result.allowed).toBe(true);
  });

  it("cost should consume multiple slots", async () => {
    const key = "gcra-cost";
    const now = 1_000_000;

    const result = await store.consume(key, limiter, now, 3);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("should reject when cost exceeds burst allowance", async () => {
    const key = "gcra-cost-reject";
    const now = 1_000_000;

    await store.consume(key, limiter, now, BURST - 1);

    const result = await store.consume(key, limiter, now, 2);

    expect(result.allowed).toBe(false);
  });

  it("reset should represent when backlog clears", async () => {
    const key = "gcra-reset";
    const now = 1_000_000;

    await store.consume(key, limiter, now, 2);

    const result = await store.consume(key, limiter, now);

    expect(result.reset).toBeGreaterThan(now);
  });

  it("reset should match theoretical arrival time", async () => {
    const key = "gcra-reset-exact";
    const now = 1_000_000;

    await store.consume(key, limiter, now);

    const result = await store.consume(key, limiter, now);

    const expected = now + INTERVAL * 1000;

    expect(result.reset).toBeGreaterThanOrEqual(expected);
  });

  it("retryAfter should exist only when rejected", async () => {
    const key = "gcra-retry";
    const now = 1_000_000;

    for (let i = 0; i < BURST; i++) {
      await store.consume(key, limiter, now);
    }

    const result = await store.consume(key, limiter, now);

    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it("retryAfter should decrease as time passes", async () => {
    const key = "gcra-retry-decrease";
    const now = 1_000_000;

    for (let i = 0; i < BURST; i++) {
      await store.consume(key, limiter, now);
    }

    const first = await store.consume(key, limiter, now);
    const later = await store.consume(key, limiter, now + 500);

    expect(later.retryAfter).toBeLessThanOrEqual(first.retryAfter!);
  });

  it("should not exceed burst under concurrency", async () => {
    const key = "gcra-concurrency";
    const now = 1_000_000;

    const concurrency = 50;

    const results = await Promise.all(
      Array.from({ length: concurrency }).map(() =>
        store.consume(key, limiter, now),
      ),
    );

    const allowed = results.filter((r) => r.allowed).length;

    expect(allowed).toBe(BURST);
  });

  it("should handle concurrent cost correctly", async () => {
    const key = "gcra-concurrency-cost";
    const now = 1_000_000;

    const results = await Promise.all(
      Array.from({ length: 10 }).map(() => store.consume(key, limiter, now, 2)),
    );

    const allowed = results.filter((r) => r.allowed).length;

    expect(allowed).toBeLessThanOrEqual(Math.floor(BURST / 2));
  });

  it("should smooth bursts across time boundaries", async () => {
    const key = "gcra-smooth";
    const base = 1_000_000;

    for (let i = 0; i < BURST; i++) {
      await store.consume(key, limiter, base);
    }

    const next = base + 1;

    const result = await store.consume(key, limiter, next);

    expect(result.allowed).toBe(false);
  });

  it("should fully reset after long idle", async () => {
    const key = "gcra-idle";
    const now = 1_000_000;

    await store.consume(key, limiter, now);

    const later = now + 60_000;

    const result = await store.consume(key, limiter, later);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(BURST - 1);
  });
});
