import { createClient, RedisClientType } from "redis";
import {
  Algorithm,
  FixedWindowConfig,
  SlidingWindowConfig,
  SlidingWindowCounterConfig,
  TokenBucketConfig,
  LeakyBucketConfig,
  GCRAConfig,
  BadArgumentsException,
} from "@limitkit/core";
import { RedisStore } from "../src/redis-store";
import { FakeClock } from "../__mocks__/fake-clock";

/**
 * Helper function to generate unique test keys
 */
function key(suffix: string): string {
  return `test:${suffix}:${Math.random()}`;
}

describe("RedisStore", () => {
  let redis: RedisClientType;
  let fakeClock: FakeClock;
  let store: RedisStore;

  beforeAll(async () => {
    redis = createClient({
      url: "redis://localhost:6379",
    });

    await redis.connect();

    // Flush database before tests
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

  describe("FixedWindow Algorithm", () => {
    const config: FixedWindowConfig = {
      name: Algorithm.FixedWindow,
      window: 10, // 10 second window
      limit: 10,
    };

    test("should accept request when count + cost <= limit", async () => {
      const key = "fw:test:1";

      // Consume 8 tokens, should succeed
      const res1 = await store.consume(key, config, 8);
      expect(res1.allowed).toBe(true);
      expect(res1.remaining).toBe(2);

      // Consume 2 more tokens, should succeed
      const res2 = await store.consume(key, config, 2);
      expect(res2.allowed).toBe(true);
      expect(res2.remaining).toBe(0);
    });

    test("should deny request when count + cost > limit", async () => {
      const key = "fw:test:2";

      // Consume 9 tokens
      const res1 = await store.consume(key, config, 9);
      expect(res1.allowed).toBe(true);

      // Try to consume 2 more, should fail
      const res2 = await store.consume(key, config, 2);
      expect(res2.allowed).toBe(false);
      expect(res2.remaining).toBe(0);
    });

    test("should calculate remaining correctly: limit - (count + cost)", async () => {
      const key = "fw:test:3";

      const res = await store.consume(key, config, 3);
      const expectedRemaining = config.limit - 3;

      expect(res.allowed).toBe(true);
      expect(res.remaining).toBe(expectedRemaining);
    });

    test("should reset window after duration expires", async () => {
      const key = "fw:test:4";

      // Consume all 10 tokens
      const res1 = await store.consume(key, config, 10);
      expect(res1.allowed).toBe(true);

      // Try to consume immediately, should fail
      const res2 = await store.consume(key, config, 1);
      expect(res2.allowed).toBe(false);

      // Advance time past window (window is 10 seconds = 10000ms)
      fakeClock.advance(10001);

      // Should be reset, allowing new requests
      const res3 = await store.consume(key, config, 1);
      expect(res3.allowed).toBe(true);
    });

    test("should calculate reset time correctly", async () => {
      const key = "fw:test:5";

      const res = await store.consume(key, config, 1);
      const expectedReset = 0 + config.window * 1000;

      expect(res.reset).toBe(expectedReset);
    });

    test("should calculate retryAfter correctly on deny", async () => {
      fakeClock.advance(1000);
      const key = "fw:test:6";

      // Consume all tokens
      await store.consume(key, config, 10);

      // Try to consume one more
      const res = await store.consume(key, config, 1);
      expect(res.allowed).toBe(false);

      // retryAfter should be ceil((reset - now) / 1000)
      const reset = config.window * 1000;
      const expectedRetry = Math.ceil((reset - 1000) / 1000);

      expect(res.retryAfter).toBe(expectedRetry);
    });

    test("should handle partial window progress", async () => {
      const key = "fw:test:7";

      // Consume 5 tokens
      const res1 = await store.consume(key, config, 5);
      expect(res1.remaining).toBe(5);

      // Advance halfway through window
      fakeClock.advance(5000);

      // Count should still be 5
      const res2 = await store.consume(key, config, 3);
      expect(res2.allowed).toBe(true);
      expect(res2.remaining).toBe(2);
    });

    test("should handle cost of 1 (default)", async () => {
      const key = "fw:test:8";

      const res = await store.consume(key, config);
      expect(res.allowed).toBe(true);
      expect(res.remaining).toBe(9);
    });

    test("should handle cost > limit", async () => {
      const key = "fw:test:9";

      const res = await store.consume(key, config, 15);
      expect(res.allowed).toBe(false);
      expect(res.remaining).toBe(0);
    });

    test("multiple keys should be independent", async () => {
      const key1 = "fw:test:10a";
      const key2 = "fw:test:10b";

      const res1 = await store.consume(key1, config, 5);
      const res2 = await store.consume(key2, config, 3);

      expect(res1.remaining).toBe(5);
      expect(res2.remaining).toBe(7);
    });
  });

  describe("SlidingWindow Algorithm", () => {
    const config: SlidingWindowConfig = {
      name: Algorithm.SlidingWindow,
      window: 10, // 10 second window
      limit: 10,
    };

    test("should accept request when within limit", async () => {
      const key = "sw:test:1";

      const res = await store.consume(key, config, 5);
      expect(res.allowed).toBe(true);
      expect(res.remaining).toBe(5);
    });

    test("should deny request when exceeding limit", async () => {
      const key = "sw:test:2";

      await store.consume(key, config, 10);
      const res = await store.consume(key, config, 1);

      expect(res.allowed).toBe(false);
      expect(res.remaining).toBe(0);
    });

    test("should decay old requests outside window", async () => {
      const key = "sw:test:3";

      // Consume 10 tokens at t=0
      const res1 = await store.consume(key, config, 10);
      expect(res1.allowed).toBe(true);

      // Immediately try to consume more, should fail
      const res2 = await store.consume(key, config, 1);
      expect(res2.allowed).toBe(false);

      // Advance 10+ seconds, requests should age out of window
      fakeClock.advance(10001);

      // Should now allow new requests as old ones expired
      const res3 = await store.consume(key, config, 1);
      expect(res3.allowed).toBe(true);
    });

    test("should handle partial window sliding", async () => {
      const key = "sw:test:4";

      // Consume 10 tokens at t=0
      await store.consume(key, config, 10);

      // Advance 5 seconds (halfway through window)
      fakeClock.advance(5000);

      // At t=5000, the requests from t=0 are still in window
      const res1 = await store.consume(key, config, 1);
      expect(res1.allowed).toBe(false);

      // Advance another 5.1 seconds (past the window)
      fakeClock.advance(5100);

      // Now the original requests have aged out
      const res2 = await store.consume(key, config, 1);
      expect(res2.allowed).toBe(true);
    });

    test("should calculate reset time", async () => {
      const key = "sw:test:5";

      const res = await store.consume(key, config, 1);

      // Reset should be exactly window duration from now (0)
      expect(res.reset).toBe(config.window * 1000);
    });

    test("should handle burst at window boundary", async () => {
      const key = "sw:test:6";

      // Consume 6 tokens early in window
      const res1 = await store.consume(key, config, 6);
      expect(res1.allowed).toBe(true);

      // Advance 9 seconds
      fakeClock.advance(9000);

      // Can consume 4 more tokens (total window at t=9000 includes requests back to t=-1000)
      const res2 = await store.consume(key, config, 4);
      expect(res2.allowed).toBe(true);

      // Advance to t=10000, first 6 requests now outside window
      fakeClock.advance(1000);

      // Should be able to consume again
      const res3 = await store.consume(key, config, 1);
      expect(res3.allowed).toBe(true);
    });

    test("should handle cost of 1 (default)", async () => {
      const key = "sw:test:7";

      const res = await store.consume(key, config);
      expect(res.allowed).toBe(true);
      expect(res.remaining).toBe(9);
    });

    test("should calculate remaining correctly", async () => {
      const key = "sw:test:8";

      const res1 = await store.consume(key, config, 3);
      expect(res1.remaining).toBe(7);

      const res2 = await store.consume(key, config, 4);
      expect(res2.remaining).toBe(3);
    });
  });

  describe("SlidingWindowCounter Algorithm", () => {
    const config: SlidingWindowCounterConfig = {
      name: Algorithm.SlidingWindowCounter,
      window: 10, // 10 second window
      limit: 10,
    };

    test("should accept request when within limit", async () => {
      const key = "swc:test:1";

      const res = await store.consume(key, config, 5);
      expect(res.allowed).toBe(true);
      expect(res.remaining).toBe(5);
    });

    test("should deny request when exceeding limit", async () => {
      const key = "swc:test:2";

      await store.consume(key, config, 10);
      const res = await store.consume(key, config, 1);

      expect(res.allowed).toBe(false);
    });

    test("should reset counter with new window", async () => {
      const key = "swc:test:3";

      // Consume all 10 tokens
      const res1 = await store.consume(key, config, 10);
      expect(res1.allowed).toBe(true);

      // Immediately try to consume, should fail
      const res2 = await store.consume(key, config, 1);
      expect(res2.allowed).toBe(false);

      // Advance past window
      fakeClock.advance(15000);

      // Should reset and allow new requests
      const res3 = await store.consume(key, config, 5);
      expect(res3.allowed).toBe(true);
    });

    test("should handle weighted counter correctly", async () => {
      const key = "swc:test:4";

      // Consume 3, 4, 2 in sequence: total 9
      const res1 = await store.consume(key, config, 3);
      expect(res1.allowed).toBe(true);

      const res2 = await store.consume(key, config, 4);
      expect(res2.allowed).toBe(true);

      const res3 = await store.consume(key, config, 2);
      expect(res3.allowed).toBe(true);
      expect(res3.remaining).toBe(1);

      // Next request should fail
      const res4 = await store.consume(key, config, 2);
      expect(res4.allowed).toBe(false);
    });

    test("should interpolate at window boundaries", async () => {
      const key = "swc:test:5";

      // Consume 7 tokens at t=0
      const res1 = await store.consume(key, config, 7);
      expect(res1.allowed).toBe(true);

      // Advance 5 seconds (halfway)
      fakeClock.advance(5000);

      // At halfway mark, interpolation should allow some new requests
      await store.consume(key, config, 3);
      // May or may not be allowed depending on interpolation calculation

      // Advance past window
      fakeClock.advance(6000);

      // Should be allowed as counter resets
      const res3 = await store.consume(key, config, 1);
      expect(res3.allowed).toBe(true);
    });

    test("should calculate reset correctly", async () => {
      const key = "swc:test:6";

      const res = await store.consume(key, config, 1);
      const expectedReset = 2 * (0 + config.window * 1000);

      expect(res.reset).toBe(expectedReset);
    });

    test("should handle multiple windows", async () => {
      const key = "swc:test:7";

      // First window
      await store.consume(key, config, 10);
      fakeClock.advance(18000);

      // Second window
      const res2 = await store.consume(key, config, 5);
      expect(res2.allowed).toBe(true);
      expect(res2.remaining).toBe(3);

      // Advance through second window
      fakeClock.advance(12000);

      // Third window
      const res3 = await store.consume(key, config, 10);
      expect(res3.allowed).toBe(true);
      expect(res3.remaining).toBe(0);
    });
  });

  describe("TokenBucket Algorithm", () => {
    const config: TokenBucketConfig = {
      name: Algorithm.TokenBucket,
      capacity: 10,
      refillRate: 2, // 2 tokens per second
    };

    test("should allow burst up to capacity", async () => {
      const key = "tb:test:1";

      // Should allow immediate consumption up to capacity
      const res = await store.consume(key, config, 10);
      expect(res.allowed).toBe(true);
      expect(res.remaining).toBe(0);
    });

    test("should deny when exceeding capacity", async () => {
      const key = "tb:test:2";

      const res = await store.consume(key, config, 11);
      expect(res.allowed).toBe(false);
      expect(res.remaining).toBe(0);
    });

    test("should refill tokens at correct rate", async () => {
      const key = "tb:test:3";

      // Consume all 10 tokens
      const res1 = await store.consume(key, config, 10);
      expect(res1.allowed).toBe(true);

      // Advance 2.5 seconds = 5 tokens refilled
      fakeClock.advance(2500);

      // Should allow consuming 5 tokens
      const res2 = await store.consume(key, config, 5);
      expect(res2.allowed).toBe(true);
      expect(res2.remaining).toBe(0);
    });

    test("should refill equation: tokens = min(cap, prev + rate * dt)", async () => {
      const key = "tb:test:4";

      // Consume 5 tokens, leaving 5
      const res1 = await store.consume(key, config, 5);
      expect(res1.allowed).toBe(true);

      // Advance 3 seconds = 6 tokens refilled, but clamped to capacity
      fakeClock.advance(3000);

      // At t=3000: prev_tokens=5, refill=6, total=11 but clamped to 10
      // Consume 1 should succeed
      const res2 = await store.consume(key, config, 1);
      expect(res2.allowed).toBe(true);
      expect(res2.remaining).toBe(9); // 10 - 1
    });

    test("should clamp tokens to capacity", async () => {
      const key = "tb:test:5";

      // Consume 1 token, leaving 9
      await store.consume(key, config, 1);

      // Advance 100 seconds (way more than needed to fill)
      fakeClock.advance(100000);

      // Should not exceed capacity
      const res = await store.consume(key, config, 1);
      // After refill over 100 seconds, tokens should be clamped to capacity
      // Remaining should be capacity - 1 = 9
      expect(res.remaining).toBe(config.capacity - 1);
    });

    test("should calculate retryAfter = ceil((cost - tokens) / rate)", async () => {
      const key = "tb:test:6";

      // Consume all tokens
      await store.consume(key, config, 10);

      // Try to consume 1 more
      const res = await store.consume(key, config, 1);
      expect(res.allowed).toBe(false);

      // retryAfter = ceil(1 / 2) = 1 second
      const expectedRetry = Math.ceil(1 / config.refillRate);
      expect(res.retryAfter).toBe(expectedRetry);
    });

    test("should calculate remaining as current tokens", async () => {
      const key = "tb:test:7";

      const res1 = await store.consume(key, config, 3);
      expect(res1.remaining).toBe(7); // 10 - 3

      fakeClock.advance(1000); // 2 tokens refilled

      const res2 = await store.consume(key, config, 2);
      expect(res2.remaining).toBe(7); // 7 + 2 - 2
    });

    test("should maintain invariant: 0 <= tokens <= capacity", async () => {
      const key = "tb:test:8";

      for (let i = 0; i < 20; i++) {
        const res = await store.consume(key, config, 1);
        expect(res.remaining).toBeGreaterThanOrEqual(0);
        expect(res.remaining).toBeLessThanOrEqual(config.capacity);
        fakeClock.advance(100);
      }
    });

    test("should calculate reset as time until bucket full", async () => {
      const key = "tb:test:9";

      // Consume 5, leaving 5
      const res1 = await store.consume(key, config, 5);
      const tokensLeft = 5;

      // Time to fill = (capacity - tokens) / rate = (10 - 5) / 2 = 2.5 seconds
      const secondsToFull = (config.capacity - tokensLeft) / config.refillRate;
      const expectedReset = 0 + secondsToFull * 1000;

      expect(res1.reset).toBe(expectedReset);
    });

    test("should handle cost > capacity", async () => {
      const key = "tb:test:10";

      const res = await store.consume(key, config, 15);
      expect(res.allowed).toBe(false);
    });

    test("should handle partial refill", async () => {
      const key = "tb:test:11";

      // Consume 8, leaving 2
      const res1 = await store.consume(key, config, 8);
      expect(res1.allowed).toBe(true);

      // Advance 1 second = 2 tokens refilled, total 4
      fakeClock.advance(1000);

      // Consume 4
      const res2 = await store.consume(key, config, 4);
      expect(res2.allowed).toBe(true);
      expect(res2.remaining).toBe(0);

      // Advance 0.5 seconds = 1 token refilled
      fakeClock.advance(500);

      // Consume 1
      const res3 = await store.consume(key, config, 1);
      expect(res3.allowed).toBe(true);
    });
  });

  describe("LeakyBucket Algorithm", () => {
    const config: LeakyBucketConfig = {
      name: Algorithm.LeakyBucket,
      capacity: 10,
      leakRate: 2, // 2 requests per second leak out
    };

    test("should allow requests up to capacity", async () => {
      const key = "lb:test:1";

      const res = await store.consume(key, config, 10);
      expect(res.allowed).toBe(true);
      expect(res.remaining).toBe(0);
    });

    test("should deny when bucket is full", async () => {
      const key = "lb:test:2";

      // Fill bucket
      await store.consume(key, config, 10);

      // Try to add more
      const res = await store.consume(key, config, 1);
      expect(res.allowed).toBe(false);
    });

    test("should leak at correct rate", async () => {
      const key = "lb:test:3";

      // Fill bucket completely
      const res1 = await store.consume(key, config, 10);
      expect(res1.allowed).toBe(true);

      // Immediately try to add
      const res2 = await store.consume(key, config, 1);
      expect(res2.allowed).toBe(false);

      // Advance 2.5 seconds = 5 requests leak
      fakeClock.advance(2500);

      // Should be able to add 5 more
      const res3 = await store.consume(key, config, 5);
      expect(res3.allowed).toBe(true);
    });

    test("should calculate remaining as available space", async () => {
      const key = "lb:test:4";

      const res1 = await store.consume(key, config, 3);
      expect(res1.remaining).toBe(7); // 10 - 3

      fakeClock.advance(1000); // 2 requests leak

      const res2 = await store.consume(key, config, 1);
      expect(res2.remaining).toBe(8); // 7 + 2 (leaked) - 1
    });

    test("should leak equation: leaked = min(current, rate * dt)", async () => {
      const key = "lb:test:5";

      // Add 3 requests
      const res1 = await store.consume(key, config, 3);
      expect(res1.allowed).toBe(true);

      // Advance 2 seconds = 4 requests leak, but only 3 in queue
      fakeClock.advance(2000);

      // Queue should be empty
      const res2 = await store.consume(key, config, 1);
      expect(res2.allowed).toBe(true);
      expect(res2.remaining).toBe(9); // 10 - 1
    });

    test("should handle multiple fill-leak cycles", async () => {
      const key = "lb:test:6";

      // First cycle
      const res1 = await store.consume(key, config, 5);
      expect(res1.allowed).toBe(true);

      fakeClock.advance(2500); // 5 requests leak

      // Second cycle
      const res2 = await store.consume(key, config, 5);
      expect(res2.allowed).toBe(true);

      fakeClock.advance(2500); // 5 more leak

      // Third cycle
      const res3 = await store.consume(key, config, 10);
      expect(res3.allowed).toBe(true);
    });

    test("should deny cost > capacity", async () => {
      const key = "lb:test:7";

      const res = await store.consume(key, config, 15);
      expect(res.allowed).toBe(false);
    });

    test("should calculate retryAfter based on leak rate", async () => {
      const key = "lb:test:8";

      // Fill bucket
      await store.consume(key, config, 10);

      // Try to add 1 more
      const res = await store.consume(key, config, 1);
      expect(res.allowed).toBe(false);

      // retryAfter = ceil(1 / leakRate) = ceil(1 / 2) = 1 second
      const expectedRetry = Math.ceil(1 / config.leakRate);
      expect(res.retryAfter).toBe(expectedRetry);
    });

    test("should calculate reset time", async () => {
      const key = "lb:test:9";

      // Add 5 requests
      const res1 = await store.consume(key, config, 5);
      expect(res1.allowed).toBe(true);

      // Initialize with some requests to drain
      const res2 = await store.consume(key, config, 1);
      expect(res2.allowed).toBe(true);

      // Reset time should be when bucket empties: 6 requests at 2 leak/sec = 3000ms
      expect(res2.reset).toBe(3000);
    });

    test("should handle fractional leak", async () => {
      const key = "lb:test:10";

      // Add 1 request
      await store.consume(key, config, 1);

      // Advance 0.5 seconds = 1 request leaked
      fakeClock.advance(500);

      // Should be able to add 1 more
      const res = await store.consume(key, config, 1);
      expect(res.allowed).toBe(true);
    });
  });

  describe("GCRA (Generic Cell Rate Algorithm)", () => {
    const config: GCRAConfig = {
      name: Algorithm.GCRA,
      interval: 1, // 1 second between requests
      burst: 5, // Allow 5 requests to arrive at once
    };

    test("should allow burst requests", async () => {
      const key = "gcra:test:1";

      // Should allow up to burst requests
      for (let i = 0; i < config.burst; i++) {
        const res = await store.consume(key, config, 1);
        expect(res.allowed).toBe(true);
      }

      // Request burst+1 should fail
      const res = await store.consume(key, config, 1);
      expect(res.allowed).toBe(false);
    });

    test("should enforce rate limit after burst", async () => {
      const key = "gcra:test:2";

      // Consume burst
      for (let i = 0; i < config.burst; i++) {
        await store.consume(key, config, 1);
      }

      // Immediately try to consume, should fail
      const res = await store.consume(key, config, 1);
      expect(res.allowed).toBe(false);
    });

    test("should allow requests at rate after burst", async () => {
      const key = "gcra:test:3";

      // Consume entire burst
      for (let i = 0; i < config.burst; i++) {
        await store.consume(key, config, 1);
      }

      // Advance interval time
      fakeClock.advance(config.interval * 1000 + 100);

      // Should allow one more request
      const res = await store.consume(key, config, 1);
      expect(res.allowed).toBe(true);
    });

    test("should calculate TAT = max(tat, now) + cost * interval", async () => {
      const key = "gcra:test:4";

      // First request
      const res1 = await store.consume(key, config, 1);
      expect(res1.allowed).toBe(true);

      // send 4 more requests
      await store.consume(key, config, 1);
      await store.consume(key, config, 1);
      await store.consume(key, config, 1);
      await store.consume(key, config, 1);
      // Advance less than interval
      fakeClock.advance(500);

      // Second request should fail as not enough time elapsed
      const res2 = await store.consume(key, config, 1);
      expect(res2.allowed).toBe(false);
    });

    test("should track Theoretical Arrival Time (TAT)", async () => {
      const key = "gcra:test:5";

      // Consume burst
      for (let i = 0; i < config.burst; i++) {
        await store.consume(key, config, 1);
      }

      // At this point, TAT has advanced by burst * interval
      const expectedTAT = config.burst * config.interval * 1000;

      // Advance exactly to first allowed time
      fakeClock.advance(expectedTAT + 100);

      const res = await store.consume(key, config, 1);
      expect(res.allowed).toBe(true);
    });

    test("should calculate retryAfter = ceil((tat - now) / 1000)", async () => {
      const key = "gcra:test:6";

      // Consume burst
      for (let i = 0; i < config.burst; i++) {
        await store.consume(key, config, 1);
      }

      // Try immediately
      const res = await store.consume(key, config, 1);
      expect(res.allowed).toBe(false);

      // retryAfter = ceil((allowAt - now) / 1000) where allowAt = tat - burstTolerance
      // tat = burst * interval = 5 * 1 = 5 seconds, burstTolerance = (burst-1)*interval = 4 seconds
      // allowAt = 5 - 4 = 1 second, retryAfter = ceil((1000 - 0) / 1000) = 1 second
      expect(res.retryAfter).toBe(config.interval);
    });

    test("should handle cost > 1", async () => {
      const key = "gcra:test:7";

      // Cost 2 should consume 2 * interval
      const res1 = await store.consume(key, config, 5);
      expect(res1.allowed).toBe(true);

      // Try immediately
      const res2 = await store.consume(key, config, 5);
      expect(res2.allowed).toBe(false);

      // Advance 2 * interval
      fakeClock.advance(config.interval * 2000 + 100);

      // Should be allowed
      const res3 = await store.consume(key, config, 1);
      expect(res3.allowed).toBe(true);
    });

    test("should allow requests within burst window", async () => {
      const key = "gcra:test:8";

      // Burst should be split over time
      const res1 = await store.consume(key, config, 1);
      expect(res1.allowed).toBe(true);

      const res2 = await store.consume(key, config, 1);
      expect(res2.allowed).toBe(true);

      const res3 = await store.consume(key, config, 1);
      expect(res3.allowed).toBe(true);
    });

    test("should calculate reset time", async () => {
      const key = "gcra:test:9";

      const res = await store.consume(key, config, 1);
      // Reset should be when TAT is reached
      expect(res.reset).toBe(1000);
    });

    test("should throw a BadArgumentsException if cost > burst", async () => {
      const key = "gcra:test:10";

      // Cost > burst should always fail initially
      await expect(
        store.consume(key, config, config.burst + 1),
      ).rejects.toThrow(BadArgumentsException);
    });

    test("should maintain steady-state rate", async () => {
      const key = "gcra:test:11";

      // Consume burst
      for (let i = 0; i < config.burst; i++) {
        const res = await store.consume(key, config, 1);
        expect(res.allowed).toBe(true);
      }

      // Now advance and consume at steady rate
      for (let i = 0; i < 5; i++) {
        fakeClock.advance(config.interval * 1000 + 50);

        const res = await store.consume(key, config, 1);
        expect(res.allowed).toBe(true);
      }
    });
  });

  describe("Cross-Algorithm Edge Cases", () => {
    test("different keys should not interfere", async () => {
      const config1: FixedWindowConfig = {
        name: Algorithm.FixedWindow,
        window: 10,
        limit: 5,
      };

      const config2: TokenBucketConfig = {
        name: Algorithm.TokenBucket,
        capacity: 10,
        refillRate: 1,
      };

      const res1 = await store.consume(key("fw:1"), config1, 5);
      const res2 = await store.consume(key("tb:1"), config2, 5);

      expect(res1.remaining).toBe(0);
      expect(res2.remaining).toBe(5);
    });

    test("cost of 0 should behave correctly", async () => {
      const config: FixedWindowConfig = {
        name: Algorithm.FixedWindow,
        window: 10,
        limit: 10,
      };

      // Cost 0 should not consume quota
      const res = await store.consume(key("zero:cost"), config, 0);
      expect(res.allowed).toBe(true);
      expect(res.remaining).toBe(10);
    });

    test("large time jumps should be handled", async () => {
      const config: TokenBucketConfig = {
        name: Algorithm.TokenBucket,
        capacity: 10,
        refillRate: 1,
      };

      // Consume all
      await store.consume(key("jumps:1"), config, 10);

      // Jump 1 hour forward
      fakeClock.advance(3600000);

      // Should be fully refilled (clamped to capacity)
      const res = await store.consume(key("jumps:1"), config, 1);
      expect(res.allowed).toBe(true);
      expect(res.remaining).toBe(config.capacity - 1);
    });

    test("rapid sequential requests", async () => {
      const config: FixedWindowConfig = {
        name: Algorithm.FixedWindow,
        window: 60,
        limit: 100,
      };

      const k = key("rapid:1");

      // Send 100 requests rapidly
      for (let i = 0; i < 100; i++) {
        const res = await store.consume(k, config, 1);
        expect(res.allowed).toBe(true);
      }

      // 101st should fail
      const res = await store.consume(k, config, 1);
      expect(res.allowed).toBe(false);
    });
  });
});
