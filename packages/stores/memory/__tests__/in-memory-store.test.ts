import { Algorithm, AlgorithmConfig } from "@limitkit/core";
import { InMemoryStore } from "../src/in-memory-store";

describe("InMemoryStore", () => {
  let store: InMemoryStore;
  const now = 1000000;

  beforeEach(() => {
    store = new InMemoryStore();
  });

  describe("Fixed Window Algorithm", () => {
    describe("default args", () => {
      it("should use default cost of 1 when not provided", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.FixedWindow,
          window: 60,
          limit: 10,
        };
        const result = await store.consume("key1", config, now);

        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(9);
        expect(result.limit).toBe(10);
      });
    });

    describe("non-default args", () => {
      it("should respect custom cost value", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.FixedWindow,
          window: 60,
          limit: 10,
        };
        const result = await store.consume("key1", config, now, 3);

        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(7);
        expect(result.limit).toBe(10);
      });

      it("should respect custom window duration", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.FixedWindow,
          window: 120,
          limit: 5,
        };
        const result = await store.consume("key1", config, now);

        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(4);
      });

      it("should respect custom limit", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.FixedWindow,
          window: 60,
          limit: 50,
        };
        const result = await store.consume("key1", config, now);

        expect(result.allowed).toBe(true);
        expect(result.limit).toBe(50);
        expect(result.remaining).toBe(49);
      });
    });

    describe("persistence", () => {
      it("should maintain state across multiple consume calls within the same window", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.FixedWindow,
          window: 60,
          limit: 10,
        };
        const key = "user:123";

        const result1 = await store.consume(key, config, now);
        expect(result1.remaining).toBe(9);

        const result2 = await store.consume(key, config, now + 5000);
        expect(result2.remaining).toBe(8);

        const result3 = await store.consume(key, config, now + 10000);
        expect(result3.remaining).toBe(7);
      });

      it("should reset counter when moving to a new window", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.FixedWindow,
          window: 60,
          limit: 10,
        };
        const key = "user:123";

        await store.consume(key, config, now);
        await store.consume(key, config, now + 5000);

        const windowDuration = 60 * 1000;
        const result = await store.consume(key, config, now + windowDuration);

        expect(result.remaining).toBe(9);
      });

      it("should prevent access when limit is exceeded", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.FixedWindow,
          window: 60,
          limit: 2,
        };
        const key = "user:123";

        const result1 = await store.consume(key, config, now);
        expect(result1.allowed).toBe(true);

        const result2 = await store.consume(key, config, now + 5000);
        expect(result2.allowed).toBe(true);

        const result3 = await store.consume(key, config, now + 10000);
        expect(result3.allowed).toBe(false);
        expect(result3.remaining).toBe(0);
      });
    });

    describe("returned object", () => {
      it("should return valid RateLimitResult structure", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.FixedWindow,
          window: 60,
          limit: 10,
        };
        const result = await store.consume("key1", config, now);

        expect(result).toHaveProperty("allowed");
        expect(result).toHaveProperty("limit");
        expect(result).toHaveProperty("remaining");
        expect(result).toHaveProperty("reset");
        expect(typeof result.allowed).toBe("boolean");
        expect(typeof result.limit).toBe("number");
        expect(typeof result.remaining).toBe("number");
        expect(typeof result.reset).toBe("number");
      });

      it("should include retryAfter when request is denied", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.FixedWindow,
          window: 60,
          limit: 1,
        };
        const key = "user:123";

        await store.consume(key, config, now);
        const deniedResult = await store.consume(key, config, now + 5000);

        expect(deniedResult.allowed).toBe(false);
        expect(deniedResult).toHaveProperty("retryAfter");
        expect(typeof deniedResult.retryAfter).toBe("number");
      });
    });
  });

  describe("Sliding Window Algorithm", () => {
    describe("default args", () => {
      it("should use default cost of 1 when not provided", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.SlidingWindow,
          window: 60,
          limit: 10,
        };
        const result = await store.consume("key1", config, now);

        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(9);
      });
    });

    describe("non-default args", () => {
      it("should respect custom cost value", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.SlidingWindow,
          window: 60,
          limit: 10,
        };
        const result = await store.consume("key1", config, now, 5);

        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(5);
      });

      it("should respect custom window duration", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.SlidingWindow,
          window: 30,
          limit: 5,
        };
        const result = await store.consume("key1", config, now);

        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(4);
      });
    });

    describe("persistence", () => {
      it("should maintain state across multiple calls", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.SlidingWindow,
          window: 60,
          limit: 10,
        };
        const key = "user:456";

        const result1 = await store.consume(key, config, now);
        expect(result1.remaining).toBe(9);

        const result2 = await store.consume(key, config, now + 5000);
        expect(result2.remaining).toBe(8);

        const result3 = await store.consume(key, config, now + 10000);
        expect(result3.remaining).toBe(7);
      });

      it("should allow requests after window has passed", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.SlidingWindow,
          window: 10,
          limit: 5,
        };
        const key = "user:456";

        await store.consume(key, config, now);
        await store.consume(key, config, now);
        await store.consume(key, config, now);
        await store.consume(key, config, now);
        await store.consume(key, config, now);

        const result = await store.consume(key, config, now + 11000);
        expect(result.allowed).toBe(true);
      });
    });

    describe("returned object", () => {
      it("should return valid RateLimitResult structure", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.SlidingWindow,
          window: 60,
          limit: 10,
        };
        const result = await store.consume("key1", config, now);

        expect(result).toHaveProperty("allowed");
        expect(result).toHaveProperty("limit");
        expect(result).toHaveProperty("remaining");
        expect(result).toHaveProperty("reset");
      });
    });
  });

  describe("Sliding Window Counter Algorithm", () => {
    describe("default args", () => {
      it("should use default cost of 1 when not provided", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.SlidingWindowCounter,
          window: 60,
          limit: 10,
        };
        const result = await store.consume("key1", config, now);

        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(9);
      });
    });

    describe("non-default args", () => {
      it("should respect custom cost value", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.SlidingWindowCounter,
          window: 60,
          limit: 10,
        };
        const result = await store.consume("key1", config, now, 4);

        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(6);
      });

      it("should respect custom window and limit", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.SlidingWindowCounter,
          window: 45,
          limit: 20,
        };
        const result = await store.consume("key1", config, now);

        expect(result.allowed).toBe(true);
        expect(result.limit).toBe(20);
      });
    });

    describe("persistence", () => {
      it("should maintain state across multiple calls", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.SlidingWindowCounter,
          window: 60,
          limit: 10,
        };
        const key = "user:789";

        const result1 = await store.consume(key, config, now);
        expect(result1.remaining).toBe(9);

        const result2 = await store.consume(key, config, now + 5000);
        expect(result2.remaining).toBe(8);

        const result3 = await store.consume(key, config, now + 10000);
        expect(result3.remaining).toBe(7);
      });

      it("should apply sliding window counter logic correctly", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.SlidingWindowCounter,
          window: 10,
          limit: 5,
        };
        const key = "user:789";

        await store.consume(key, config, now);
        await store.consume(key, config, now + 1000);

        const midWindowResult = await store.consume(key, config, now + 5000);
        expect(midWindowResult.allowed).toBe(true);
        expect(midWindowResult.remaining).toBe(2);
      });
    });

    describe("returned object", () => {
      it("should return valid RateLimitResult structure", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.SlidingWindowCounter,
          window: 60,
          limit: 10,
        };
        const result = await store.consume("key1", config, now);

        expect(result).toHaveProperty("allowed");
        expect(result).toHaveProperty("limit");
        expect(result).toHaveProperty("remaining");
        expect(result).toHaveProperty("reset");
      });
    });
  });

  describe("Token Bucket Algorithm", () => {
    describe("default args", () => {
      it("should use default cost of 1 when not provided", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.TokenBucket,
          capacity: 10,
          refillRate: 1,
        };
        const result = await store.consume("key1", config, now);

        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(9);
      });

      it("should initialize with full capacity", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.TokenBucket,
          capacity: 100,
          refillRate: 5,
        };
        const result = await store.consume("key1", config, now);

        expect(result.remaining).toBe(99);
      });
    });

    describe("non-default args", () => {
      it("should respect custom cost value", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.TokenBucket,
          capacity: 10,
          refillRate: 1,
        };
        const result = await store.consume("key1", config, now, 5);

        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(5);
      });

      it("should respect custom capacity", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.TokenBucket,
          capacity: 50,
          refillRate: 2,
        };
        const result = await store.consume("key1", config, now);

        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(49);
      });

      it("should respect custom refillRate", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.TokenBucket,
          capacity: 10,
          refillRate: 5,
        };
        const result1 = await store.consume("key1", config, now);
        const result2 = await store.consume("key2", config, now + 2000);

        expect(result1.allowed).toBe(true);
        expect(result2.allowed).toBe(true);
      });
    });

    describe("persistence", () => {
      it("should maintain tokens across multiple calls", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.TokenBucket,
          capacity: 10,
          refillRate: 1,
        };
        const key = "bucket:1";

        const result1 = await store.consume(key, config, now);
        expect(result1.remaining).toBe(9);

        const result2 = await store.consume(key, config, now + 500);
        expect(result2.remaining).toBe(8);

        const result3 = await store.consume(key, config, now + 500);
        expect(result3.remaining).toBe(7);
      });

      it("should refill tokens over time up to capacity", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.TokenBucket,
          capacity: 5,
          refillRate: 1,
        };
        const key = "bucket:2";

        await store.consume(key, config, now);
        await store.consume(key, config, now + 100);
        await store.consume(key, config, now + 200);
        await store.consume(key, config, now + 300);
        await store.consume(key, config, now + 400);

        const deniedResult = await store.consume(key, config, now + 500);
        expect(deniedResult.allowed).toBe(false);

        const allowedResult = await store.consume(key, config, now + 1500);
        expect(allowedResult.allowed).toBe(true);
      });
    });

    describe("returned object", () => {
      it("should return valid RateLimitResult structure", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.TokenBucket,
          capacity: 10,
          refillRate: 1,
        };
        const result = await store.consume("key1", config, now);

        expect(result).toHaveProperty("allowed");
        expect(result).toHaveProperty("limit");
        expect(result).toHaveProperty("remaining");
        expect(result).toHaveProperty("reset");
      });

      it("should include retryAfter when bucket is empty", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.TokenBucket,
          capacity: 1,
          refillRate: 1,
        };
        const key = "bucket:3";

        await store.consume(key, config, now);
        const deniedResult = await store.consume(key, config, now + 100);

        expect(deniedResult.allowed).toBe(false);
        expect(deniedResult).toHaveProperty("retryAfter");
      });
    });
  });

  describe("Leaky Bucket Algorithm", () => {
    describe("default args", () => {
      it("should use default cost of 1 when not provided", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.LeakyBucket,
          capacity: 10,
          leakRate: 1,
        };
        const result = await store.consume("key1", config, now);

        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(9);
      });

      it("should initialize with full capacity", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.LeakyBucket,
          capacity: 20,
          leakRate: 2,
        };
        const result = await store.consume("key1", config, now);

        expect(result.remaining).toBe(19);
      });
    });

    describe("non-default args", () => {
      it("should respect custom cost value", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.LeakyBucket,
          capacity: 10,
          leakRate: 1,
        };
        const result = await store.consume("key1", config, now, 3);

        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(7);
      });

      it("should respect custom capacity", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.LeakyBucket,
          capacity: 50,
          leakRate: 5,
        };
        const result = await store.consume("key1", config, now);

        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(49);
      });

      it("should respect custom leakRate", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.LeakyBucket,
          capacity: 10,
          leakRate: 3,
        };
        const result1 = await store.consume("key1", config, now);
        const result2 = await store.consume("key2", config, now + 1000);

        expect(result1.allowed).toBe(true);
        expect(result2.allowed).toBe(true);
      });
    });

    describe("persistence", () => {
      it("should maintain queue state across multiple calls", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.LeakyBucket,
          capacity: 10,
          leakRate: 1,
        };
        const key = "bucket:4";

        const result1 = await store.consume(key, config, now);
        expect(result1.remaining).toBe(9);

        const result2 = await store.consume(key, config, now + 1000);
        expect(result2.remaining).toBe(9);

        const result3 = await store.consume(key, config, now + 2000);
        expect(result3.remaining).toBe(9);
      });

      it("should leak requests over time", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.LeakyBucket,
          capacity: 5,
          leakRate: 1,
        };
        const key = "bucket:5";

        await store.consume(key, config, now);
        await store.consume(key, config, now + 100);
        await store.consume(key, config, now + 200);
        await store.consume(key, config, now + 300);
        await store.consume(key, config, now + 400);

        const deniedResult = await store.consume(key, config, now + 500);
        expect(deniedResult.allowed).toBe(false);

        const allowedResult = await store.consume(key, config, now + 2000);
        expect(allowedResult.allowed).toBe(true);
      });
    });

    describe("returned object", () => {
      it("should return valid RateLimitResult structure", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.LeakyBucket,
          capacity: 10,
          leakRate: 1,
        };
        const result = await store.consume("key1", config, now);

        expect(result).toHaveProperty("allowed");
        expect(result).toHaveProperty("limit");
        expect(result).toHaveProperty("remaining");
        expect(result).toHaveProperty("reset");
      });

      it("should include retryAfter when bucket is full", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.LeakyBucket,
          capacity: 1,
          leakRate: 1,
        };
        const key = "bucket:6";

        await store.consume(key, config, now);
        const deniedResult = await store.consume(key, config, now + 100);

        expect(deniedResult.allowed).toBe(false);
        expect(deniedResult).toHaveProperty("retryAfter");
      });
    });
  });

  describe("GCRA Algorithm", () => {
    describe("default args", () => {
      it("should use default cost of 1 when not provided", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.GCRA,
          interval: 10,
          burst: 5,
        };
        const result = await store.consume("key1", config, now);

        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(4);
      });

      it("should initialize with burst capacity", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.GCRA,
          interval: 10,
          burst: 10,
        };
        const result = await store.consume("key1", config, now);

        expect(result.remaining).toBe(9);
      });
    });

    describe("non-default args", () => {
      it("should respect custom cost value", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.GCRA,
          interval: 10,
          burst: 5,
        };
        const result = await store.consume("key1", config, now, 2);

        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(3);
      });

      it("should respect custom interval", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.GCRA,
          interval: 20,
          burst: 5,
        };
        const result = await store.consume("key1", config, now);

        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(4);
      });

      it("should respect custom burst", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.GCRA,
          interval: 10,
          burst: 20,
        };
        const result = await store.consume("key1", config, now);

        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(19);
      });
    });

    describe("persistence", () => {
      it("should maintain TAT (Theoretical Arrival Time) across calls", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.GCRA,
          interval: 10,
          burst: 5,
        };
        const key = "gcra:1";

        const result1 = await store.consume(key, config, now);
        expect(result1.allowed).toBe(true);
        expect(result1.remaining).toBe(4);

        const result2 = await store.consume(key, config, now + 1000);
        expect(result2.allowed).toBe(true);
        expect(result2.remaining).toBe(3);

        const result3 = await store.consume(key, config, now + 2000);
        expect(result3.allowed).toBe(true);
        expect(result3.remaining).toBe(2);
      });

      it("should allow requests after interval has passed", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.GCRA,
          interval: 5,
          burst: 2,
        };
        const key = "gcra:2";

        await store.consume(key, config, now);
        await store.consume(key, config, now + 100);

        const deniedResult = await store.consume(key, config, now + 200);
        expect(deniedResult.allowed).toBe(false);

        const allowedResult = await store.consume(key, config, now + 6000);
        expect(allowedResult.allowed).toBe(true);
      });
    });

    describe("returned object", () => {
      it("should return valid RateLimitResult structure", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.GCRA,
          interval: 10,
          burst: 5,
        };
        const result = await store.consume("key1", config, now);

        expect(result).toHaveProperty("allowed");
        expect(result).toHaveProperty("limit");
        expect(result).toHaveProperty("remaining");
        expect(result).toHaveProperty("reset");
      });

      it("should include retryAfter when burst is exceeded", async () => {
        const config: AlgorithmConfig = {
          name: Algorithm.GCRA,
          interval: 10,
          burst: 1,
        };
        const key = "gcra:3";

        await store.consume(key, config, now);
        const deniedResult = await store.consume(key, config, now + 100);

        expect(deniedResult.allowed).toBe(false);
        expect(deniedResult).toHaveProperty("retryAfter");
      });
    });
  });

  describe("Multiple Keys Isolation", () => {
    it("should maintain separate state for different keys", async () => {
      const config: AlgorithmConfig = {
        name: Algorithm.FixedWindow,
        window: 60,
        limit: 5,
      };

      const result1 = await store.consume("user:1", config, now);
      const result2 = await store.consume("user:2", config, now);
      const result3 = await store.consume("user:1", config, now + 1000);

      expect(result1.remaining).toBe(4);
      expect(result2.remaining).toBe(4);
      expect(result3.remaining).toBe(3);
    });
  });
});
