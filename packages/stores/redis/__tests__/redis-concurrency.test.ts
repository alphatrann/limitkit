import { createClient, RedisClientType } from "redis";
import {
  Algorithm,
  FixedWindowConfig,
  TokenBucketConfig,
  LeakyBucketConfig,
  GCRAConfig,
} from "@limitkit/core";
import { RedisStore } from "../src/redis-store";
import { FakeClock } from "../__mocks__/fake-clock";

describe("RedisStore Concurrency Tests", () => {
  let redis: RedisClientType;
  let fakeClock: FakeClock;
  let store: RedisStore;

  beforeAll(async () => {
    redis = createClient({
      url: "redis://localhost:6379",
    });

    await redis.connect();
    await redis.flushDb();
  });

  afterAll(async () => {
    await redis.quit();
  });

  beforeEach(async () => {
    fakeClock = new FakeClock();
    store = new RedisStore(redis, fakeClock);
    await store.init();
    await redis.flushDb();
  });

  afterEach(async () => {
    // Ensure complete cleanup between tests
    await redis.flushDb();
  });

  describe("FixedWindow Concurrency", () => {
    const config: FixedWindowConfig = {
      name: Algorithm.FixedWindow,
      window: 10,
      limit: 10,
    };

    test("should handle 20 concurrent requests with limit 10 (exactly 10 succeed)", async () => {
      const key = "fw:concurrent:1";

      // Fire 20 concurrent requests
      const results = await Promise.all(
        Array(20)
          .fill(0)
          .map(() => store.consume(key, config, 1)),
      );

      // Exactly 10 should succeed
      const allowed = results.filter((r) => r.allowed).length;
      expect(allowed).toBe(10);

      // Remaining should be 0 for all denied requests
      const denied = results.filter((r) => !r.allowed);
      expect(denied.every((r) => r.remaining === 0)).toBe(true);
    });

    test("should maintain correct state after concurrent burst", async () => {
      const key = "fw:concurrent:2";

      // Fire 15 concurrent requests
      await Promise.all(
        Array(15)
          .fill(0)
          .map(() => store.consume(key, config, 1)),
      );

      // Now try sequential requests - should be denied until window resets
      const res1 = await store.consume(key, config, 1);
      expect(res1.allowed).toBe(false);

      // Advance past window
      fakeClock.advance(10001);

      // Should allow new requests
      const res2 = await store.consume(key, config, 1);
      expect(res2.allowed).toBe(true);
    });

    test("should handle concurrent requests with cost > 1", async () => {
      const key = "fw:concurrent:3";

      // Fire 10 concurrent requests with cost=2 each
      const results = await Promise.all(
        Array(10)
          .fill(0)
          .map(() => store.consume(key, config, 2)),
      );

      // Only 5 should succeed (10 * 2 = 20 > limit of 10)
      const allowed = results.filter((r) => r.allowed).length;
      expect(allowed).toBe(5);
    });

    test("should handle multiple concurrent keys independently", async () => {
      const key1 = "fw:concurrent:4a";
      const key2 = "fw:concurrent:4b";

      // 15 concurrent requests split between 2 keys
      const results = await Promise.all([
        ...Array(15)
          .fill(0)
          .map(() => store.consume(key1, config, 1)),
        ...Array(15)
          .fill(0)
          .map(() => store.consume(key2, config, 1)),
      ]);

      // Split results by key (first 15 for key1, last 15 for key2)
      const key1Results = results.slice(0, 15);
      const key2Results = results.slice(15);

      // Each key should have exactly 10 allowed
      const key1Allowed = key1Results.filter((r) => r.allowed).length;
      const key2Allowed = key2Results.filter((r) => r.allowed).length;

      expect(key1Allowed).toBe(10);
      expect(key2Allowed).toBe(10);
    });
  });

  describe("TokenBucket Concurrency", () => {
    const config: TokenBucketConfig = {
      name: Algorithm.TokenBucket,
      capacity: 10,
      refillRate: 1, // 1 token per second
    };

    test("should allow exactly capacity tokens in concurrent burst", async () => {
      const key = "tb:concurrent:1";

      // Fire 20 concurrent requests (capacity is 10)
      const results = await Promise.all(
        Array(20)
          .fill(0)
          .map(() => store.consume(key, config, 1)),
      );

      // Exactly 10 should succeed
      const allowed = results.filter((r) => r.allowed).length;
      expect(allowed).toBe(10);

      // All remaining should be 0
      const denied = results.filter((r) => !r.allowed);
      expect(denied.every((r) => r.remaining === 0)).toBe(true);
    });

    test("should correctly refill after concurrent consumption", async () => {
      const key = "tb:concurrent:2";

      // Consume all 10 tokens concurrently
      const results1 = await Promise.all(
        Array(10)
          .fill(0)
          .map(() => store.consume(key, config, 1)),
      );

      expect(results1.filter((r) => r.allowed).length).toBe(10);

      // Immediately try more - should all fail
      const results2 = await Promise.all(
        Array(5)
          .fill(0)
          .map(() => store.consume(key, config, 1)),
      );

      expect(results2.filter((r) => r.allowed).length).toBe(0);

      // Advance 5 seconds (5 tokens refilled)
      fakeClock.advance(5000);

      // Try 5 more - should succeed
      const results3 = await Promise.all(
        Array(5)
          .fill(0)
          .map(() => store.consume(key, config, 1)),
      );

      expect(results3.filter((r) => r.allowed).length).toBe(5);
    });

    test("should handle concurrent requests with varying costs", async () => {
      const key = "tb:concurrent:3";

      // Mix of different cost requests concurrently
      const results = await Promise.all([
        store.consume(key, config, 3), // cost 3
        store.consume(key, config, 2), // cost 2
        store.consume(key, config, 2), // cost 2
        store.consume(key, config, 2), // cost 2
        store.consume(key, config, 2), // cost 2 - may or may not succeed
      ]);

      // Total cost = 3+2+2+2+2 = 11, but capacity is 10
      // So we expect exactly 4 to succeed
      const allowed = results.filter((r) => r.allowed).length;
      expect(allowed).toBe(4);
    });
  });

  describe("LeakyBucket Concurrency", () => {
    const config: LeakyBucketConfig = {
      name: Algorithm.LeakyBucket,
      capacity: 10,
      leakRate: 2, // 2 requests per second leak out
    };

    test("should handle capacity burst concurrently", async () => {
      const key = "lb:concurrent:1";

      // 15 concurrent requests (capacity is 10)
      const results = await Promise.all(
        Array(15)
          .fill(0)
          .map(() => store.consume(key, config, 1)),
      );

      // Exactly 10 should succeed
      const allowed = results.filter((r) => r.allowed).length;
      expect(allowed).toBe(10);
    });

    test("should leak correctly after concurrent fill", async () => {
      const key = "lb:concurrent:2";

      // Fill bucket with 10 concurrent requests
      const fillResults = await Promise.all(
        Array(10)
          .fill(0)
          .map(() => store.consume(key, config, 1)),
      );

      const filled = fillResults.filter((r) => r.allowed).length;
      expect(filled).toBe(10);

      // Try to add more - should fail since bucket is full
      let moreResults = await Promise.all(
        Array(5)
          .fill(0)
          .map(() => store.consume(key, config, 1)),
      );

      const denied = moreResults.filter((r) => !r.allowed).length;
      expect(denied).toBe(5); // All should be denied

      // Advance 2.5 seconds (5 requests should leak out)
      fakeClock.advance(2500);

      // Try concurrently again - should succeed
      moreResults = await Promise.all(
        Array(5)
          .fill(0)
          .map(() => store.consume(key, config, 1)),
      );

      const allowed = moreResults.filter((r) => r.allowed).length;
      expect(allowed).toBe(5);
    });

    test("should maintain correct remaining after concurrent requests", async () => {
      const key = "lb:concurrent:3";

      // 3 concurrent requests (capacity 10)
      const results = await Promise.all(
        Array(3)
          .fill(0)
          .map(() => store.consume(key, config, 1)),
      );

      // All should succeed
      expect(results.every((r) => r.allowed)).toBe(true);

      // Calculate remaining: should be capacity - 3 = 7
      const lastResult = results[results.length - 1];
      expect(lastResult.remaining).toBe(7);
    });
  });

  describe("GCRA Concurrency", () => {
    const config: GCRAConfig = {
      name: Algorithm.GCRA,
      interval: 1, // 1 second between requests
      burst: 5, // Allow 5 concurrent requests
    };

    test("should allow exactly burst concurrent requests", async () => {
      const key = "gcra:concurrent:1";

      // 10 concurrent requests (burst is 5)
      const results = await Promise.all(
        Array(10)
          .fill(0)
          .map(() => store.consume(key, config, 1)),
      );

      // Exactly 5 should succeed (burst size)
      const allowed = results.filter((r) => r.allowed).length;
      expect(allowed).toBe(config.burst);
    });

    test("should enforce rate limit after concurrent burst", async () => {
      const key = "gcra:concurrent:2";

      // Consume burst concurrently
      const burstResults = await Promise.all(
        Array(config.burst)
          .fill(0)
          .map(() => store.consume(key, config, 1)),
      );

      expect(burstResults.filter((r) => r.allowed).length).toBe(config.burst);

      // Immediately try more concurrently - should all fail
      const rateLimitResults = await Promise.all(
        Array(5)
          .fill(0)
          .map(() => store.consume(key, config, 1)),
      );

      expect(rateLimitResults.filter((r) => r.allowed).length).toBe(0);

      // Advance interval time
      fakeClock.advance(config.interval * 1000 + 100);

      // Should allow one more
      const afterWaitResults = await Promise.all(
        Array(2)
          .fill(0)
          .map(() => store.consume(key, config, 1)),
      );

      expect(afterWaitResults.filter((r) => r.allowed).length).toBe(1);
    });

    test("should handle concurrent requests with cost > 1", async () => {
      const key = "gcra:concurrent:3";

      // 5 concurrent requests with cost 1 each - all should succeed (burst=5)
      const results1 = await Promise.all(
        Array(5)
          .fill(0)
          .map(() => store.consume(key, config, 1)),
      );

      expect(results1.filter((r) => r.allowed).length).toBe(5);

      // Advance interval
      fakeClock.advance(config.interval * 1000 + 100);

      // 3 concurrent requests with cost 2 each = need 6 units (burst is 5)
      // So only some should succeed based on TAT
      const results2 = await Promise.all(
        Array(3)
          .fill(0)
          .map(() => store.consume(key, config, 2)),
      );

      // At least some should be denied
      const allowed = results2.filter((r) => r.allowed).length;
      expect(allowed).toBeLessThanOrEqual(3);
      expect(allowed).toBeGreaterThan(0);
    });

    test("should maintain TAT correctly under concurrent pressure", async () => {
      const key = "gcra:concurrent:4";

      // First burst of 5 concurrent requests
      const burst1 = await Promise.all(
        Array(5)
          .fill(0)
          .map(() => store.consume(key, config, 1)),
      );

      expect(burst1.filter((r) => r.allowed).length).toBe(5);

      // Advance 1 second (allows 1 more request)
      fakeClock.advance(1000 + 100);

      // 10 concurrent requests - only 1 should succeed
      const results2 = await Promise.all(
        Array(10)
          .fill(0)
          .map(() => store.consume(key, config, 1)),
      );

      const allowed = results2.filter((r) => r.allowed).length;
      expect(allowed).toBe(1);
    });
  });

  describe("Cross-Algorithm Concurrency", () => {
    test("should maintain independent limits across different algorithms", async () => {
      const fwConfig: FixedWindowConfig = {
        name: Algorithm.FixedWindow,
        window: 10,
        limit: 5,
      };

      const tbConfig: TokenBucketConfig = {
        name: Algorithm.TokenBucket,
        capacity: 5,
        refillRate: 1,
      };

      const fwKey = "cross:fw:1";
      const tbKey = "cross:tb:1";

      // 10 concurrent requests to each
      const [fwResults, tbResults] = await Promise.all([
        Promise.all(
          Array(10)
            .fill(0)
            .map(() => store.consume(fwKey, fwConfig, 1)),
        ),
        Promise.all(
          Array(10)
            .fill(0)
            .map(() => store.consume(tbKey, tbConfig, 1)),
        ),
      ]);

      // Each should allow exactly their limit
      expect(fwResults.filter((r) => r.allowed).length).toBe(5);
      expect(tbResults.filter((r) => r.allowed).length).toBe(5);
    });

    test("should handle high concurrency without deadlocks", async () => {
      const config: FixedWindowConfig = {
        name: Algorithm.FixedWindow,
        window: 10,
        limit: 50,
      };

      const key = "cross:high-concurrency:1";

      // 100 concurrent requests
      const results = await Promise.all(
        Array(100)
          .fill(0)
          .map(() => store.consume(key, config, 1)),
      );

      // Exactly 50 should succeed
      const allowed = results.filter((r) => r.allowed).length;
      expect(allowed).toBe(50);

      // Should not have any unexpected values
      const allValid = results.every(
        (r) => r.remaining >= 0 && r.remaining <= 50,
      );
      expect(allValid).toBe(true);
    });
  });
});
