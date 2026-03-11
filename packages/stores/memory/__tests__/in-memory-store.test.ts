import {
  Algorithm,
  FixedWindowConfig,
  GCRAConfig,
  LeakyBucketConfig,
  RateLimitResult,
  SlidingWindowConfig,
  SlidingWindowCounterConfig,
  TokenBucketConfig,
  UnknownAlgorithmException,
} from "@limitkit/core";
import { InMemoryStore } from "../src";
import {
  AlgorithmResult,
  FixedWindowState,
  GCRAState,
  LeakyBucketState,
  SlidingWindowCounterState,
  SlidingWindowState,
  TokenBucketState,
} from "../src/types";
import * as algorithms from "../src/algorithms";

// Mock all algorithm functions
jest.mock("../src/algorithms");

describe("InMemoryStore", () => {
  let store: InMemoryStore;
  const mockFixedWindow = algorithms.fixedWindow as jest.MockedFunction<
    typeof algorithms.fixedWindow
  >;
  const mockSlidingWindow = algorithms.slidingWindow as jest.MockedFunction<
    typeof algorithms.slidingWindow
  >;
  const mockSlidingWindowCounter =
    algorithms.slidingWindowCounter as jest.MockedFunction<
      typeof algorithms.slidingWindowCounter
    >;
  const mockTokenBucket = algorithms.tokenBucket as jest.MockedFunction<
    typeof algorithms.tokenBucket
  >;
  const mockLeakyBucket = algorithms.leakyBucket as jest.MockedFunction<
    typeof algorithms.leakyBucket
  >;
  const mockGCRA = algorithms.gcra as jest.MockedFunction<
    typeof algorithms.gcra
  >;

  beforeEach(() => {
    store = new InMemoryStore();
    jest.clearAllMocks();
  });

  describe("FixedWindow algorithm", () => {
    const config: FixedWindowConfig = {
      name: Algorithm.FixedWindow,
      window: 60,
      limit: 100,
    };

    it("should call fixedWindow with correct parameters on first call", async () => {
      const key = "test-key";
      const cost = 5;
      const now = Date.now();
      const expectedOutput: RateLimitResult = {
        allowed: true,
        remaining: 95,
        reset: now + 60000,
      };
      const expectedNewState: FixedWindowState = {
        count: 5,
        windowStart: now,
      };

      mockFixedWindow.mockReturnValueOnce({
        state: expectedNewState,
        output: expectedOutput,
      });

      const result = await store.consume(key, config, cost);

      expect(mockFixedWindow).toHaveBeenCalledTimes(1);
      expect(mockFixedWindow).toHaveBeenCalledWith(
        undefined,
        config,
        expect.any(Number),
        cost,
      );
      expect(result).toEqual(expectedOutput);
    });

    it("should persist state and pass persisted state on second call", async () => {
      const key = "test-key";
      const cost = 5;

      const firstState: FixedWindowState = {
        count: 5,
        windowStart: 1000,
      };
      const firstOutput: RateLimitResult = {
        allowed: true,
        remaining: 95,
        reset: 61000,
      };

      const secondState: FixedWindowState = {
        count: 10,
        windowStart: 1000,
      };
      const secondOutput: RateLimitResult = {
        allowed: true,
        remaining: 90,
        reset: 61000,
      };

      mockFixedWindow
        .mockReturnValueOnce({
          state: firstState,
          output: firstOutput,
        })
        .mockReturnValueOnce({
          state: secondState,
          output: secondOutput,
        });

      const result1 = await store.consume(key, config, cost);
      expect(result1).toEqual(firstOutput);

      const result2 = await store.consume(key, config, cost);

      expect(mockFixedWindow).toHaveBeenCalledTimes(2);
      // Second call should receive the persisted state from the first call
      expect(mockFixedWindow).toHaveBeenNthCalledWith(
        2,
        firstState,
        config,
        expect.any(Number),
        cost,
      );
      expect(result2).toEqual(secondOutput);
    });

    it("should use default cost of 1 when not provided", async () => {
      const key = "test-key";
      const expectedState: FixedWindowState = {
        count: 1,
        windowStart: 1000,
      };
      const expectedOutput: RateLimitResult = {
        allowed: true,
        remaining: 99,
        reset: 61000,
      };

      mockFixedWindow.mockReturnValueOnce({
        state: expectedState,
        output: expectedOutput,
      });

      const result = await store.consume(key, config);

      expect(mockFixedWindow).toHaveBeenCalledWith(
        undefined,
        config,
        expect.any(Number),
        1,
      );
      expect(result).toEqual(expectedOutput);
    });
  });

  describe("SlidingWindow algorithm", () => {
    const config: SlidingWindowConfig = {
      name: Algorithm.SlidingWindow,
      window: 60,
      limit: 100,
    };

    it("should call slidingWindow with correct parameters", async () => {
      const key = "test-key";
      const cost = 3;
      const expectedOutput: RateLimitResult = {
        allowed: true,
        remaining: 97,
        reset: Date.now() + 60000,
      };
      const expectedNewState: SlidingWindowState = {
        buffer: [Date.now()],
        head: 0,
        size: 1,
      };

      mockSlidingWindow.mockReturnValueOnce({
        state: expectedNewState,
        output: expectedOutput,
      });

      const result = await store.consume(key, config, cost);

      expect(mockSlidingWindow).toHaveBeenCalledTimes(1);
      expect(mockSlidingWindow).toHaveBeenCalledWith(
        undefined,
        config,
        expect.any(Number),
        cost,
      );
      expect(result).toEqual(expectedOutput);
    });

    it("should persist and retrieve sliding window state correctly", async () => {
      const key = "test-key";
      const cost = 2;

      const firstState: SlidingWindowState = {
        buffer: [1000, 2000],
        head: 0,
        size: 2,
      };
      const firstOutput: RateLimitResult = {
        allowed: true,
        remaining: 98,
        reset: 61000,
      };

      const secondState: SlidingWindowState = {
        buffer: [1000, 2000, 3000],
        head: 0,
        size: 3,
      };
      const secondOutput: RateLimitResult = {
        allowed: true,
        remaining: 97,
        reset: 61000,
      };

      mockSlidingWindow
        .mockReturnValueOnce({
          state: firstState,
          output: firstOutput,
        })
        .mockReturnValueOnce({
          state: secondState,
          output: secondOutput,
        });

      await store.consume(key, config, cost);
      const result2 = await store.consume(key, config, cost);

      expect(mockSlidingWindow).toHaveBeenNthCalledWith(
        2,
        firstState,
        config,
        expect.any(Number),
        cost,
      );
      expect(result2).toEqual(secondOutput);
    });
  });

  describe("SlidingWindowCounter algorithm", () => {
    const config: SlidingWindowCounterConfig = {
      name: Algorithm.SlidingWindowCounter,
      window: 60,
      limit: 100,
    };

    it("should call slidingWindowCounter with correct parameters", async () => {
      const key = "test-key";
      const cost = 4;
      const expectedOutput: RateLimitResult = {
        allowed: true,
        remaining: 96,
        reset: Date.now() + 60000,
      };
      const expectedNewState: SlidingWindowCounterState = {
        count: 4,
        prevCount: 0,
        windowStart: Date.now(),
      };

      mockSlidingWindowCounter.mockReturnValueOnce({
        state: expectedNewState,
        output: expectedOutput,
      });

      const result = await store.consume(key, config, cost);

      expect(mockSlidingWindowCounter).toHaveBeenCalledTimes(1);
      expect(mockSlidingWindowCounter).toHaveBeenCalledWith(
        undefined,
        config,
        expect.any(Number),
        cost,
      );
      expect(result).toEqual(expectedOutput);
    });
  });

  describe("TokenBucket algorithm", () => {
    const config: TokenBucketConfig = {
      name: Algorithm.TokenBucket,
      capacity: 100,
      refillRate: 10,
    };

    it("should call tokenBucket with correct parameters", async () => {
      const key = "test-key";
      const cost = 5;
      const expectedOutput: RateLimitResult = {
        allowed: true,
        remaining: 95,
        reset: Date.now() + 10000,
      };
      const expectedNewState: TokenBucketState = {
        tokens: 95,
        lastRefill: Date.now(),
      };

      mockTokenBucket.mockReturnValueOnce({
        state: expectedNewState,
        output: expectedOutput,
      });

      const result = await store.consume(key, config, cost);

      expect(mockTokenBucket).toHaveBeenCalledTimes(1);
      expect(mockTokenBucket).toHaveBeenCalledWith(
        undefined,
        config,
        expect.any(Number),
        cost,
      );
      expect(result).toEqual(expectedOutput);
    });

    it("should persist and retrieve token bucket state correctly", async () => {
      const key = "test-key";
      const cost = 2;

      const firstState: TokenBucketState = {
        tokens: 95,
        lastRefill: 1000,
      };
      const firstOutput: RateLimitResult = {
        allowed: true,
        remaining: 95,
        reset: 11000,
      };

      const secondState: TokenBucketState = {
        tokens: 93,
        lastRefill: 2000,
      };
      const secondOutput: RateLimitResult = {
        allowed: true,
        remaining: 93,
        reset: 12000,
      };

      mockTokenBucket
        .mockReturnValueOnce({
          state: firstState,
          output: firstOutput,
        })
        .mockReturnValueOnce({
          state: secondState,
          output: secondOutput,
        });

      await store.consume(key, config, cost);
      const result2 = await store.consume(key, config, cost);

      expect(mockTokenBucket).toHaveBeenNthCalledWith(
        2,
        firstState,
        config,
        expect.any(Number),
        cost,
      );
      expect(result2).toEqual(secondOutput);
    });
  });

  describe("LeakyBucket algorithm", () => {
    const config: LeakyBucketConfig = {
      name: Algorithm.LeakyBucket,
      capacity: 100,
      leakRate: 10,
    };

    it("should call leakyBucket with correct parameters", async () => {
      const key = "test-key";
      const cost = 3;
      const expectedOutput: RateLimitResult = {
        allowed: true,
        remaining: 97,
        reset: Date.now() + 10000,
      };
      const expectedNewState: LeakyBucketState = {
        queueSize: 3,
        lastLeak: Date.now(),
      };

      mockLeakyBucket.mockReturnValueOnce({
        state: expectedNewState,
        output: expectedOutput,
      });

      const result = await store.consume(key, config, cost);

      expect(mockLeakyBucket).toHaveBeenCalledTimes(1);
      expect(mockLeakyBucket).toHaveBeenCalledWith(
        undefined,
        config,
        expect.any(Number),
        cost,
      );
      expect(result).toEqual(expectedOutput);
    });

    it("should persist and retrieve leaky bucket state correctly", async () => {
      const key = "test-key";
      const cost = 2;

      const firstState: LeakyBucketState = {
        queueSize: 5,
        lastLeak: 1000,
      };
      const firstOutput: RateLimitResult = {
        allowed: true,
        remaining: 95,
        reset: 11000,
      };

      const secondState: LeakyBucketState = {
        queueSize: 7,
        lastLeak: 2000,
      };
      const secondOutput: RateLimitResult = {
        allowed: true,
        remaining: 93,
        reset: 12000,
      };

      mockLeakyBucket
        .mockReturnValueOnce({
          state: firstState,
          output: firstOutput,
        })
        .mockReturnValueOnce({
          state: secondState,
          output: secondOutput,
        });

      await store.consume(key, config, cost);
      const result2 = await store.consume(key, config, cost);

      expect(mockLeakyBucket).toHaveBeenNthCalledWith(
        2,
        firstState,
        config,
        expect.any(Number),
        cost,
      );
      expect(result2).toEqual(secondOutput);
    });
  });

  describe("GCRA algorithm", () => {
    const config: GCRAConfig = {
      name: Algorithm.GCRA,
      burst: 100,
      interval: 60,
    };

    it("should call gcra with correct parameters", async () => {
      const key = "test-key";
      const cost = 2;
      const expectedOutput: RateLimitResult = {
        allowed: true,
        remaining: 98,
        reset: Date.now() + 60000,
      };
      const expectedNewState: GCRAState = {
        tat: Date.now(),
      };

      mockGCRA.mockReturnValueOnce({
        state: expectedNewState,
        output: expectedOutput,
      });

      const result = await store.consume(key, config, cost);

      expect(mockGCRA).toHaveBeenCalledTimes(1);
      expect(mockGCRA).toHaveBeenCalledWith(
        undefined,
        config,
        expect.any(Number),
        cost,
      );
      expect(result).toEqual(expectedOutput);
    });

    it("should persist and retrieve GCRA state correctly", async () => {
      const key = "test-key";
      const cost = 3;

      const firstState: GCRAState = {
        tat: 5000,
      };
      const firstOutput: RateLimitResult = {
        allowed: true,
        remaining: 97,
        reset: 65000,
      };

      const secondState: GCRAState = {
        tat: 6000,
      };
      const secondOutput: RateLimitResult = {
        allowed: true,
        remaining: 97,
        reset: 66000,
      };

      mockGCRA
        .mockReturnValueOnce({
          state: firstState,
          output: firstOutput,
        })
        .mockReturnValueOnce({
          state: secondState,
          output: secondOutput,
        });

      await store.consume(key, config, cost);
      const result2 = await store.consume(key, config, cost);

      expect(mockGCRA).toHaveBeenNthCalledWith(
        2,
        firstState,
        config,
        expect.any(Number),
        cost,
      );
      expect(result2).toEqual(secondOutput);
    });
  });

  describe("Multiple keys state isolation", () => {
    it("should maintain independent state for different keys", async () => {
      const config: FixedWindowConfig = {
        name: Algorithm.FixedWindow,
        window: 60,
        limit: 100,
      };

      const state1: FixedWindowState = { count: 5, windowStart: 1000 };
      const state2: FixedWindowState = { count: 10, windowStart: 2000 };

      mockFixedWindow
        .mockReturnValueOnce({
          state: state1,
          output: { allowed: true, remaining: 95, reset: 61000 },
        })
        .mockReturnValueOnce({
          state: state2,
          output: { allowed: true, remaining: 90, reset: 62000 },
        });

      const result1 = await store.consume("key1", config, 5);
      const result2 = await store.consume("key2", config, 10);

      expect(result1).toEqual({ allowed: true, remaining: 95, reset: 61000 });
      expect(result2).toEqual({ allowed: true, remaining: 90, reset: 62000 });

      // Third call to key1 should use state1, not state2
      mockFixedWindow.mockReturnValueOnce({
        state: { count: 6, windowStart: 1000 },
        output: { allowed: true, remaining: 94, reset: 61000 },
      });

      await store.consume("key1", config, 1);

      expect(mockFixedWindow).toHaveBeenNthCalledWith(
        3,
        state1,
        config,
        expect.any(Number),
        1,
      );
    });
  });

  describe("Rate limit rejection with state persistence", () => {
    it("should persist state even when request is rejected", async () => {
      const config: FixedWindowConfig = {
        name: Algorithm.FixedWindow,
        window: 60,
        limit: 100,
      };

      const rejectedState: FixedWindowState = {
        count: 100,
        windowStart: 1000,
      };
      const rejectedOutput: RateLimitResult = {
        allowed: false,
        remaining: 0,
        reset: 61000,
        retryAfter: 30,
      };

      const successState: FixedWindowState = {
        count: 100,
        windowStart: 61000,
      };
      const successOutput: RateLimitResult = {
        allowed: true,
        remaining: 99,
        reset: 121000,
      };

      mockFixedWindow
        .mockReturnValueOnce({
          state: rejectedState,
          output: rejectedOutput,
        })
        .mockReturnValueOnce({
          state: successState,
          output: successOutput,
        });

      const result1 = await store.consume("key", config, 100);
      expect(result1).toEqual(rejectedOutput);

      const result2 = await store.consume("key", config, 1);

      // The second call should receive the persisted rejected state
      expect(mockFixedWindow).toHaveBeenNthCalledWith(
        2,
        rejectedState,
        config,
        expect.any(Number),
        1,
      );
      expect(result2).toEqual(successOutput);
    });
  });

  describe("Error handling", () => {
    it("should throw UnknownAlgorithmException for unsupported algorithm", async () => {
      const invalidConfig = {
        name: "unknown-algorithm",
      } as any;

      await expect(store.consume("key", invalidConfig, 1)).rejects.toThrow(
        UnknownAlgorithmException,
      );
    });
  });

  describe("Parameter passing accuracy", () => {
    it("should pass exact timestamp from Date.now() to algorithm", async () => {
      const config: FixedWindowConfig = {
        name: Algorithm.FixedWindow,
        window: 60,
        limit: 100,
      };

      mockFixedWindow.mockReturnValueOnce({
        state: { count: 1, windowStart: 1000 },
        output: { allowed: true, remaining: 99, reset: 61000 },
      });

      const beforeCall = Date.now();
      await store.consume("key", config, 1);
      const afterCall = Date.now();

      // Verify that the timestamp passed falls within the expected range
      const passedTimestamp = mockFixedWindow.mock.calls[0][2];
      expect(passedTimestamp).toBeGreaterThanOrEqual(beforeCall);
      expect(passedTimestamp).toBeLessThanOrEqual(afterCall);
    });

    it("should pass exact cost parameter to algorithm", async () => {
      const config: FixedWindowConfig = {
        name: Algorithm.FixedWindow,
        window: 60,
        limit: 100,
      };

      mockFixedWindow.mockReturnValueOnce({
        state: { count: 7, windowStart: 1000 },
        output: { allowed: true, remaining: 93, reset: 61000 },
      });

      const cost = 7;
      await store.consume("key", config, cost);

      expect(mockFixedWindow).toHaveBeenCalledWith(
        undefined,
        config,
        expect.any(Number),
        cost,
      );
    });

    it("should pass reconstructed config with name to algorithm", async () => {
      const config: FixedWindowConfig = {
        name: Algorithm.FixedWindow,
        window: 60,
        limit: 100,
      };

      mockFixedWindow.mockReturnValueOnce({
        state: { count: 1, windowStart: 1000 },
        output: { allowed: true, remaining: 99, reset: 61000 },
      });

      await store.consume("key", config, 1);

      const callArgs = mockFixedWindow.mock.calls[0];
      const passedConfig = callArgs[1];

      // Verify the config passed includes the name property
      expect(passedConfig).toHaveProperty("name", Algorithm.FixedWindow);
      expect(passedConfig).toHaveProperty("window", 60);
      expect(passedConfig).toHaveProperty("limit", 100);
      expect(passedConfig).toEqual(config);
    });
  });
});
