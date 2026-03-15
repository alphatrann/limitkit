import { createClient, RedisClientType } from "redis";
import {
  RedisStore,
  RedisFixedWindow,
  RedisSlidingWindow,
  RedisSlidingWindowCounter,
  RedisTokenBucket,
  RedisLeakyBucket,
  RedisGCRA,
  RedisCompatible,
} from "../src";

import { Algorithm } from "@limitkit/core";

describe("RedisStore Integration", () => {
  let redis: RedisClientType;
  let store: RedisStore;

  const algorithms: (Algorithm<any> & RedisCompatible)[] = [
    new RedisFixedWindow({
      name: "fixed-window",
      window: 5,
      limit: 5,
    }),

    new RedisSlidingWindow({
      name: "sliding-window",
      window: 5,
      limit: 5,
    }),

    new RedisSlidingWindowCounter({
      name: "sliding-window-counter",
      window: 5,
      limit: 5,
    }),

    new RedisTokenBucket({
      name: "token-bucket",
      capacity: 5,
      refillRate: 1,
    }),

    new RedisLeakyBucket({
      name: "leaky-bucket",
      capacity: 5,
      leakRate: 1,
    }),

    new RedisGCRA({
      name: "gcra",
      burst: 5,
      interval: 1,
    }),
  ];

  beforeAll(async () => {
    redis = createClient({ url: "redis://localhost:6379/1" });
    await redis.connect();

    store = new RedisStore(redis);
  });

  beforeEach(async () => {
    await redis.flushDb();
  });

  afterAll(async () => {
    await redis.flushAll();
    await redis.quit();
  });

  /**
   * ---------------------------------------------------------
   * Basic Store Execution
   * ---------------------------------------------------------
   */

  it.each(algorithms)("should execute algorithm %p", async (algo) => {
    const key = "store-basic";
    const now = 1_000_000;

    const result = await store.consume(key, algo, now);

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(algo.limit);

    expect(typeof result.remaining).toBe("number");
    expect(typeof result.reset).toBe("number");
    expect(typeof result.retryAfter).toBe("number");
  });

  /**
   * ---------------------------------------------------------
   * Script Caching
   * ---------------------------------------------------------
   */

  it("should cache Lua scripts locally", async () => {
    const limiter = algorithms[0];
    const key = "store-cache";
    const now = 1_000_000;

    // start with a fresh store to avoid cached scripts
    const freshStore = new RedisStore(redis);

    const spy = jest.spyOn(redis, "scriptLoad");

    await freshStore.consume(key, limiter, now);
    await freshStore.consume(key, limiter, now);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  /**
   * ---------------------------------------------------------
   * NOSCRIPT Recovery
   * ---------------------------------------------------------
   */

  it("should reload script when Redis loses script cache", async () => {
    const limiter = algorithms[0];
    const key = "store-noscript";
    const now = 1_000_000;

    await store.consume(key, limiter, now);

    await redis.scriptFlush();

    const result = await store.consume(key, limiter, now);

    expect(result.allowed).toBe(true);
  });

  /**
   * ---------------------------------------------------------
   * RetryAfter Contract
   * ---------------------------------------------------------
   */

  it.each(algorithms)(
    "retryAfter should be 0 when allowed (%p)",
    async (algo) => {
      const key = "retry-contract";
      const now = 1_000_000;

      const result = await store.consume(key, algo, now);

      expect(result.allowed).toBe(true);
      expect(result.retryAfter).toBe(0);
    },
  );

  /**
   * ---------------------------------------------------------
   * Concurrency Test
   * ---------------------------------------------------------
   */

  it.each(algorithms)(
    "should enforce limits under concurrency (%p)",
    async (algo) => {
      const key = "store-concurrency";
      const now = 1_000_000;

      const results = await Promise.all(
        Array.from({ length: 50 }).map(() => store.consume(key, algo, now)),
      );

      const allowed = results.filter((r) => r.allowed).length;

      expect(allowed).toBeLessThanOrEqual(algo.limit);
    },
  );

  /**
   * ---------------------------------------------------------
   * Cost Propagation
   * ---------------------------------------------------------
   */

  it.each(algorithms)("should propagate cost correctly (%p)", async (algo) => {
    const key = "store-cost";
    const now = 1_000_000;

    const result = await store.consume(key, algo, now, 2);

    expect(typeof result.allowed).toBe("boolean");
  });

  /**
   * ---------------------------------------------------------
   * Result Contract
   * ---------------------------------------------------------
   */

  it.each(algorithms)(
    "should return valid RateLimitResult (%p)",
    async (algo) => {
      const key = "store-contract";
      const now = 1_000_000;

      const result = await store.consume(key, algo, now);

      expect(result).toHaveProperty("allowed");
      expect(result).toHaveProperty("limit");
      expect(result).toHaveProperty("remaining");
      expect(result).toHaveProperty("reset");
      expect(result).toHaveProperty("retryAfter");
    },
  );

  /**
   * ---------------------------------------------------------
   * FUZZ TEST
   * ---------------------------------------------------------
   */

  it.each(algorithms)(
    "fuzz test should maintain invariants (%p)",
    async (algo) => {
      const key = "store-fuzz";

      let now = 1_000_000;

      for (let i = 0; i < 500; i++) {
        now += Math.floor(Math.random() * 2000);

        const cost = 1 + Math.floor(Math.random() * 3);

        const result = await store.consume(key, algo, now, cost);

        /**
         * Basic invariants
         */

        expect(result.limit).toBe(algo.limit);

        expect(result.remaining).toBeGreaterThanOrEqual(0);

        expect(result.reset).toBeGreaterThanOrEqual(now);

        if (result.allowed) {
          expect(result.retryAfter).toBe(0);
        } else {
          expect(result.retryAfter).toBeGreaterThanOrEqual(0);
        }
      }
    },
  );
});
