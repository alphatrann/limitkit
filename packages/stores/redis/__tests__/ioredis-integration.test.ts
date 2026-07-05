import Redis from "ioredis";
import { Algorithm } from "@limitkit/core";
import {
  RedisCompatible,
  RedisShapingLeakyBucket,
  RedisStore,
  fixedWindow,
  gcra,
  leakyBucket,
  shapingLeakyBucket,
  slidingWindow,
  slidingWindowCounter,
  tokenBucket,
} from "../src";

describe("RedisStore ioredis Integration", () => {
  let redis: Redis;
  let store: RedisStore;

  const algorithms: (Algorithm<any> & RedisCompatible)[] = [
    fixedWindow({
      window: 5,
      limit: 5,
    }),

    slidingWindow({
      window: 5,
      limit: 5,
    }),

    slidingWindowCounter({
      window: 5,
      limit: 5,
    }),

    tokenBucket({
      capacity: 5,
      refillRate: 1,
    }),

    leakyBucket({
      capacity: 5,
      leakRate: 1,
    }),

    shapingLeakyBucket({
      capacity: 10,
      leakRate: 5,
    }),

    gcra({
      burst: 5,
      interval: 1,
    }),
  ];

  beforeAll(() => {
    redis = new Redis("redis://localhost:6379", {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });

    store = new RedisStore(redis);
  });

  beforeAll(async () => {
    await redis.connect();
  });

  beforeEach(async () => {
    await redis.flushdb();
  });

  afterAll(async () => {
    await redis.flushall();
    redis.disconnect();
  });

  it.each(algorithms)("should execute algorithm %p", async (algo) => {
    const key = "ioredis-store-basic";
    const now = 1_000_000;

    const result = await store.consume(key, algo, now);

    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(algo.limit);
    expect(typeof result.remaining).toBe("number");
    expect(typeof result.resetAt).toBe("number");
    if (algo instanceof RedisShapingLeakyBucket)
      expect(typeof result.availableAt).toBe("number");
    else expect(typeof result.availableAt).toBe("undefined");
  });

  it("should reload script when Redis loses script cache", async () => {
    const limiter = algorithms[0];
    const key = "ioredis-store-noscript";
    const now = 1_000_000;

    await store.consume(key, limiter, now);

    await redis.script("FLUSH");

    const result = await store.consume(key, limiter, now);

    expect(result.allowed).toBe(true);
  });

  it.each(algorithms)(
    "should enforce limits under concurrency (%p)",
    async (algo) => {
      const key = "ioredis-store-concurrency";
      const now = 1_000_000;

      const results = await Promise.all(
        Array.from({ length: 50 }).map(() => store.consume(key, algo, now)),
      );

      const allowed = results.filter((r) => r.allowed).length;

      expect(allowed).toBeLessThanOrEqual(algo.limit);
    },
  );
});

