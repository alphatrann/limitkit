import { createClient, RedisClientType } from "redis";
import {
  RedisCompatible,
  RedisFixedWindow,
  RedisGCRA,
  RedisLeakyBucket,
  RedisSlidingWindow,
  RedisSlidingWindowCounter,
  RedisStore,
  RedisTokenBucket,
} from "../src";
import { Algorithm, AlgorithmConfig } from "@limitkit/core";

const base = 1_000_000;

function getAlgorithms() {
  return [
    {
      name: "FixedWindow",
      instance: () =>
        new RedisFixedWindow({ name: "fixed-window", limit: 10, window: 10 }),
      limit: 10,
    },
    {
      name: "SlidingWindow",
      instance: () =>
        new RedisSlidingWindow({
          name: "sliding-window",
          limit: 10,
          window: 10,
        }),
      limit: 10,
    },
    {
      name: "SlidingWindowCounter",
      instance: () =>
        new RedisSlidingWindowCounter({
          name: "sliding-window-counter",
          limit: 10,
          window: 10,
        }),
      limit: 10,
    },
    {
      name: "TokenBucket",
      instance: () =>
        new RedisTokenBucket({
          name: "token-bucket",
          capacity: 10,
          refillRate: 5,
        }),
      limit: 10,
    },
    {
      name: "LeakyBucket",
      instance: () =>
        new RedisLeakyBucket({
          name: "leaky-bucket",
          capacity: 10,
          leakRate: 5,
        }),
      limit: 10,
    },
    {
      name: "GCRA",
      instance: () => new RedisGCRA({ name: "gcra", burst: 10, interval: 1 }),
      limit: 10,
    },
  ];
}

describe("RedisStore Integration Tests", () => {
  let redis: RedisClientType;
  let store: RedisStore;

  beforeAll(async () => {
    redis = createClient();
    await redis.connect();
  });

  afterAll(async () => {
    await redis.quit();
  });

  beforeEach(async () => {
    await redis.flushDb();
    store = new RedisStore(redis);
  });

  const algorithms = getAlgorithms();

  describe.each(algorithms)("$name", ({ instance, limit }) => {
    let limiter: Algorithm<AlgorithmConfig> & RedisCompatible;

    beforeEach(() => {
      limiter = instance();
    });

    test("should validate the config params before consuming", async () => {
      const limiterSpy = jest.spyOn(limiter, "validate");
      await store.consume("user", limiter, base);

      expect(limiterSpy).toHaveBeenCalled();
    });

    test("lua script is cached after first load", async () => {
      const spy = jest.spyOn(redis, "scriptLoad").mockClear();

      await store.consume("user", limiter, base);
      await store.consume("user", limiter, base);

      expect(spy).toHaveBeenCalledTimes(1);
    });

    test("recovers automatically from NOSCRIPT", async () => {
      await store.consume("user", limiter, base);

      await redis.scriptFlush();

      const r = await store.consume("user", limiter, base);

      expect(r).toBeDefined();
    });

    test("allows requests within limit", async () => {
      let allowed = 0;

      for (let i = 0; i < limit; i++) {
        const r = await store.consume("user", limiter, base);
        if (r.allowed) allowed++;
      }

      expect(allowed).toBe(limit);
    });

    test("rejects requests beyond limit", async () => {
      for (let i = 0; i <= limit; i++) {
        await store.consume("user", limiter, base);
      }

      const r = await store.consume("user", limiter, base);

      expect(r.allowed).toBe(false);
      expect(r.retryAfter).toBeGreaterThanOrEqual(0);
    });

    test("state persists in Redis", async () => {
      const r1 = await store.consume("user", limiter, base);
      const r2 = await store.consume("user", limiter, base);

      expect(r2.remaining).toBeLessThanOrEqual(r1.remaining);
    });

    test("different keys are isolated", async () => {
      await store.consume("userA", limiter, base);

      const r = await store.consume("userB", limiter, base);

      expect(r.remaining).toBe(limit - 1);
    });

    test("large time jump restores capacity", async () => {
      for (let i = 0; i < limit; i++) {
        await store.consume("user", limiter, base);
      }

      const r = await store.consume("user", limiter, base + 60000);

      expect(r.allowed).toBe(true);
    });

    test("cost argument works correctly", async () => {
      const r = await store.consume("user", limiter, base, 3);

      expect(r.remaining).toBeLessThanOrEqual(limit - 3);
    });

    test("burst concurrency respects limit (atomic Lua)", async () => {
      const promises = [];

      for (let i = 0; i < limit * 2; i++) {
        promises.push(store.consume("user", limiter, base));
      }

      const results = await Promise.all(promises);

      const allowed = results.filter((r) => r.allowed).length;

      expect(allowed).toBeLessThanOrEqual(limit);
    });

    test("mixed-cost concurrency respects limit", async () => {
      const costs = [3, 2, 4, 1, 5, 2];

      const results = await Promise.all(
        costs.map((c) => store.consume("user", limiter, base, c)),
      );

      let acceptedCost = 0;

      results.forEach((r, i) => {
        if (r.allowed) acceptedCost += costs[i];
      });

      expect(acceptedCost).toBeLessThanOrEqual(limit);
    });

    test("concurrency across multiple keys", async () => {
      const promises = [];

      for (let i = 0; i < 10; i++) {
        promises.push(store.consume("userA", limiter, base));
        promises.push(store.consume("userB", limiter, base));
      }

      const results = await Promise.all(promises);

      const userA = results.filter((_, i) => i % 2 === 0);
      const userB = results.filter((_, i) => i % 2 === 1);

      expect(userA.filter((r) => r.allowed).length).toBeLessThanOrEqual(limit);

      expect(userB.filter((r) => r.allowed).length).toBeLessThanOrEqual(limit);
    });

    test("reset timestamp is in the future", async () => {
      const r = await store.consume("user", limiter, base);

      expect(r.reset).toBeGreaterThanOrEqual(base);
    });

    test("remaining never negative", async () => {
      for (let i = 0; i < limit * 2; i++) {
        const r = await store.consume("user", limiter, base);

        expect(r.remaining).toBeGreaterThanOrEqual(0);
      }
    });

    test("stress test random costs", async () => {
      const costs = Array.from(
        { length: 50 },
        () => Math.floor(Math.random() * 5) + 1,
      );

      const results = await Promise.all(
        costs.map((c) => store.consume("user", limiter, base, c)),
      );

      let acceptedCost = 0;

      results.forEach((r, i) => {
        if (r.allowed) acceptedCost += costs[i];
      });

      expect(acceptedCost).toBeLessThanOrEqual(limit);
    });
  });
});
