import { createClient, RedisClientType } from "redis";
import { RedisCompatible, RedisStore, shapingLeakyBucket } from "../src";
import { Algorithm, LeakyBucketConfig } from "@limitkit/core";

describe("RedisLeakyBucket", () => {
  const CAPACITY = 5;
  const LEAK_RATE = 1; // per second

  let redis: RedisClientType;
  let store: RedisStore;
  let limiter: Algorithm<LeakyBucketConfig> & RedisCompatible;

  beforeAll(async () => {
    redis = createClient();
    await redis.connect();
    await redis.scriptFlush();

    store = new RedisStore(redis);

    limiter = shapingLeakyBucket({
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

  it("allows requests until capacity is reached", async () => {
    const key = "slb-allow";
    const now = 1_000_000;

    for (let i = 1; i <= CAPACITY; i++) {
      const r = await store.consume(key, limiter, now);
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(CAPACITY - i);
      expect(r.availableAt).toBe(now + (i / LEAK_RATE) * 1000);
    }
  });

  it("rejects when queue is full", async () => {
    const key = "slb-full";
    const now = 1_000_000;

    for (let i = 0; i < CAPACITY; i++) {
      await store.consume(key, limiter, now);
    }

    const r = await store.consume(key, limiter, now);

    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
    expect(r.availableAt).toBe(now + Math.ceil((CAPACITY / LEAK_RATE) * 1000));
  });

  it("gradually frees capacity as time passes", async () => {
    const key = "slb-leak";
    const now = 1_000_000;

    for (let i = 0; i < CAPACITY; i++) {
      await store.consume(key, limiter, now);
    }

    const later = now + 2_000;
    const r = await store.consume(key, limiter, later);

    // One token should have leaked
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(1);
    expect(r.availableAt).toBeGreaterThan(later);
  });

  it("supports multi-cost scheduling", async () => {
    const key = "slb-cost";
    const now = 1_000_000;

    const r1 = await store.consume(key, limiter, now, 2);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(CAPACITY - 2);
    expect(r1.availableAt).toBe(now + 2_000);

    const r2 = await store.consume(key, limiter, now, 2);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(CAPACITY - 4);
    expect(r2.availableAt).toBe(now + 4_000);
  });

  it("rejects when cost exceeds capacity", async () => {
    const key = "slb-cost-reject";
    const now = 1_000_000;

    await store.consume(key, limiter, now, CAPACITY - 1);

    const r = await store.consume(key, limiter, now, 2);
    expect(r.allowed).toBe(false);
  });

  it("resetAt equals queue drain time", async () => {
    const key = "slb-resetAt";
    const now = 1_000_000;

    await store.consume(key, limiter, now, 2);

    const r = await store.consume(key, limiter, now);

    const expectedReset = now + (3 / LEAK_RATE) * 1000;
    expect(r.resetAt).toBeLessThanOrEqual(expectedReset);
  });

  it("handles concurrency without exceeding capacity", async () => {
    const key = "slb-concurrency";
    const now = 1_000_000;

    const results = await Promise.all(
      Array.from({ length: 50 }).map(() => store.consume(key, limiter, now)),
    );

    const allowedCount = results.filter((r) => r.allowed).length;
    expect(allowedCount).toBe(CAPACITY);
  });

  it("handles concurrent cost correctly", async () => {
    const key = "slb-concurrency-cost";
    const now = 1_000_000;

    const results = await Promise.all(
      Array.from({ length: 10 }).map(() => store.consume(key, limiter, now, 2)),
    );

    const allowedCount = results.filter((r) => r.allowed).length;
    expect(allowedCount).toBeLessThanOrEqual(Math.floor(CAPACITY / 2));
  });
});
