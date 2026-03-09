import { MockStore } from "../__mocks__";
import { RateLimiter } from "../src";
import { EmptyRulesException } from "../src/exceptions/empty-rules-exception";
import { Algorithm, AlgorithmConfig, RateLimitResult } from "../src/types";

describe("RateLimiter", () => {
  let store: MockStore;

  beforeEach(() => {
    store = new MockStore();
    jest.spyOn(console, "log").mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should throw an EmptyRulesException if there are no rules", () => {
      expect(() => new RateLimiter({ rules: [], store })).toThrow(
        EmptyRulesException,
      );
    });
  });

  describe("policy resolution", () => {
    it("should resolve static policy", async () => {
      const policy = { name: Algorithm.FixedWindow, window: 60, limit: 100 };
      const storeSpy = jest.spyOn(store, "consume").mockResolvedValue({
        allowed: true,
        remaining: 50,
        reset: Date.now(),
      });

      const rateLimiter = new RateLimiter({
        rules: [{ name: "rule1", key: "key1", policy }],
        store,
      });

      await rateLimiter.consume({});

      expect(storeSpy).toHaveBeenCalledWith("key1", policy, 1);
    });

    it("should resolve dynamic policy function", async () => {
      const policy = jest.fn().mockResolvedValue({
        name: Algorithm.FixedWindow,
        window: 60,
        limit: 100,
      });
      const storeSpy = jest.spyOn(store, "consume").mockResolvedValue({
        allowed: true,
        remaining: 50,
        reset: Date.now(),
      });

      const ctx = { userId: "user-123" };
      const rateLimiter = new RateLimiter({
        rules: [{ name: "rule1", key: "key1", policy }],
        store,
      });

      await rateLimiter.consume(ctx);

      expect(policy).toHaveBeenCalledWith(ctx);
      expect(storeSpy).toHaveBeenCalled();
    });
  });

  describe("key extraction", () => {
    it("should extract static key", async () => {
      const storeSpy = jest.spyOn(store, "consume").mockResolvedValue({
        allowed: true,
        remaining: 50,
        reset: Date.now(),
      });

      const rateLimiter = new RateLimiter({
        rules: [
          {
            name: "rule1",
            key: "static-key",
            policy: { name: Algorithm.FixedWindow, window: 60, limit: 100 },
          },
        ],
        store,
      });

      await rateLimiter.consume({});

      expect(storeSpy).toHaveBeenCalledWith(
        "static-key",
        expect.any(Object),
        1,
      );
    });

    it("should extract dynamic key from function", async () => {
      const keyResolver = jest.fn().mockReturnValue("dynamic-key-value");
      const storeSpy = jest.spyOn(store, "consume").mockResolvedValue({
        allowed: true,
        remaining: 50,
        reset: Date.now(),
      });

      const ctx = { userId: "user-123" };
      const rateLimiter = new RateLimiter({
        rules: [
          {
            name: "rule1",
            key: keyResolver,
            policy: { name: Algorithm.FixedWindow, window: 60, limit: 100 },
          },
        ],
        store,
      });

      await rateLimiter.consume(ctx);

      expect(keyResolver).toHaveBeenCalledWith(ctx);
      expect(storeSpy).toHaveBeenCalledWith(
        "dynamic-key-value",
        expect.any(Object),
        1,
      );
    });
  });

  describe("cost extraction", () => {
    it("should use default cost of 1 when not specified", async () => {
      const storeSpy = jest.spyOn(store, "consume").mockResolvedValue({
        allowed: true,
        remaining: 50,
        reset: Date.now(),
      });

      const rateLimiter = new RateLimiter({
        rules: [
          {
            name: "rule1",
            key: "key1",
            policy: { name: Algorithm.FixedWindow, window: 60, limit: 100 },
          },
        ],
        store,
      });

      await rateLimiter.consume({});

      expect(storeSpy).toHaveBeenCalledWith("key1", expect.any(Object), 1);
    });

    it("should extract static cost", async () => {
      const storeSpy = jest.spyOn(store, "consume").mockResolvedValue({
        allowed: true,
        remaining: 50,
        reset: Date.now(),
      });

      const rateLimiter = new RateLimiter({
        rules: [
          {
            name: "rule1",
            key: "key1",
            cost: 5,
            policy: { name: Algorithm.FixedWindow, window: 60, limit: 100 },
          },
        ],
        store,
      });

      await rateLimiter.consume({});

      expect(storeSpy).toHaveBeenCalledWith("key1", expect.any(Object), 5);
    });

    it("should extract dynamic cost from function", async () => {
      const costResolver = jest.fn().mockReturnValue(10);
      const storeSpy = jest.spyOn(store, "consume").mockResolvedValue({
        allowed: true,
        remaining: 50,
        reset: Date.now(),
      });

      const ctx = { multiplier: 2 };
      const rateLimiter = new RateLimiter({
        rules: [
          {
            name: "rule1",
            key: "key1",
            cost: costResolver,
            policy: { name: Algorithm.FixedWindow, window: 60, limit: 100 },
          },
        ],
        store,
      });

      await rateLimiter.consume(ctx);

      expect(costResolver).toHaveBeenCalledWith(ctx);
      expect(storeSpy).toHaveBeenCalledWith("key1", expect.any(Object), 10);
    });
  });

  describe("store receives correct arguments", () => {
    it("should call store.consume with correct arguments for single rule", async () => {
      const storeSpy = jest.spyOn(store, "consume").mockResolvedValue({
        allowed: true,
        remaining: 42,
        reset: Date.now(),
      });

      const policy: AlgorithmConfig = {
        name: Algorithm.FixedWindow,
        window: 60,
        limit: 100,
      };
      const rateLimiter = new RateLimiter({
        rules: [
          {
            name: "rule1",
            key: "my-key",
            cost: 3,
            policy,
          },
        ],
        store,
      });

      await rateLimiter.consume({});

      expect(storeSpy).toHaveBeenCalledTimes(1);
      expect(storeSpy).toHaveBeenCalledWith("my-key", policy, 3);
    });

    it("should call store.consume for each rule until one fails", async () => {
      const storeSpy = jest
        .spyOn(store, "consume")
        .mockResolvedValueOnce({
          allowed: true,
          remaining: 50,
          reset: Date.now(),
        })
        .mockResolvedValueOnce({
          allowed: false,
          remaining: 0,
          reset: Date.now(),
        });

      const policy1: AlgorithmConfig = {
        name: Algorithm.FixedWindow,
        window: 60,
        limit: 100,
      };
      const policy2: AlgorithmConfig = {
        name: Algorithm.FixedWindow,
        window: 60,
        limit: 50,
      };

      const rateLimiter = new RateLimiter({
        rules: [
          { name: "rule1", key: "key1", policy: policy1 },
          { name: "rule2", key: "key2", policy: policy2 },
        ],
        store,
      });

      await rateLimiter.consume({});

      expect(storeSpy).toHaveBeenCalledTimes(2);
      expect(storeSpy).toHaveBeenNthCalledWith(1, "key1", policy1, 1);
      expect(storeSpy).toHaveBeenNthCalledWith(2, "key2", policy2, 1);
    });
  });

  describe("failed scenario (remaining = 0)", () => {
    it("should return limited result without debug info when remaining = 0", async () => {
      jest.spyOn(store, "consume").mockResolvedValue({
        allowed: false,
        remaining: 0,
        reset: Date.now() + 30000,
        retryAfter: 30,
      });

      const rateLimiter = new RateLimiter({
        rules: [
          {
            name: "rate-limit-rule",
            key: "key1",
            policy: { name: Algorithm.FixedWindow, window: 60, limit: 100 },
          },
        ],
        store,
        debug: false,
      });

      const result = await rateLimiter.consume({});

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBe(30);
      expect(result).not.toHaveProperty("details");
    });

    it("should return detailed result with failedRule when remaining = 0 and debug = true", async () => {
      const now = Date.now();
      jest.spyOn(store, "consume").mockResolvedValue({
        allowed: false,
        remaining: 0,
        reset: now + 30000,
        retryAfter: 30,
      });

      const rateLimiter = new RateLimiter({
        rules: [
          {
            name: "failed-rule",
            key: "key1",
            policy: { name: Algorithm.FixedWindow, window: 60, limit: 100 },
          },
        ],
        store,
        debug: true,
      });

      const result = await rateLimiter.consume({});

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBe(30);
      expect((result as any).failedRule).toBe("failed-rule");
      expect((result as any).details).toBeDefined();
    });

    it("should stop evaluating rules after first failure", async () => {
      const storeSpy = jest
        .spyOn(store, "consume")
        .mockResolvedValueOnce({
          allowed: false,
          remaining: 0,
          reset: Date.now(),
        })
        .mockResolvedValueOnce({
          allowed: true,
          remaining: 50,
          reset: Date.now(),
        });

      const rateLimiter = new RateLimiter({
        rules: [
          {
            name: "rule1",
            key: "key1",
            policy: { name: Algorithm.FixedWindow, window: 60, limit: 100 },
          },
          {
            name: "rule2",
            key: "key2",
            policy: { name: Algorithm.FixedWindow, window: 60, limit: 100 },
          },
        ],
        store,
      });

      await rateLimiter.consume({});

      // Should only call store.consume once (for the first rule)
      expect(storeSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("success scenario", () => {
    it("should return success result without debug info when allowed", async () => {
      jest.spyOn(store, "consume").mockResolvedValue({
        allowed: true,
        remaining: 75,
        reset: Date.now() + 60000,
      });

      const rateLimiter = new RateLimiter({
        rules: [
          {
            name: "rule1",
            key: "key1",
            policy: { name: Algorithm.FixedWindow, window: 60, limit: 100 },
          },
        ],
        store,
        debug: false,
      });

      const result = await rateLimiter.consume({});

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(75);
      expect(result).not.toHaveProperty("details");
    });

    it("should return detailed result with details when allowed and debug = true", async () => {
      jest.spyOn(store, "consume").mockResolvedValue({
        allowed: true,
        remaining: 75,
        reset: Date.now() + 60000,
      });

      jest.spyOn(console, "log");
      const rateLimiter = new RateLimiter({
        rules: [
          {
            name: "rule1",
            key: "key1",
            policy: { name: Algorithm.FixedWindow, window: 60, limit: 100 },
          },
        ],
        store,
        debug: true,
      });

      const result = await rateLimiter.consume({});

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(75);
      expect((result as any).details).toBeDefined();
      expect((result as any).details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "rule1",
            allowed: true,
            remaining: 75,
          }),
        ]),
      );
    });

    it("should evaluate all rules when all succeed", async () => {
      const storeSpy = jest
        .spyOn(store, "consume")
        .mockResolvedValueOnce({
          allowed: true,
          remaining: 50,
          reset: Date.now(),
        })
        .mockResolvedValueOnce({
          allowed: true,
          remaining: 100,
          reset: Date.now(),
        });

      const rateLimiter = new RateLimiter({
        rules: [
          {
            name: "rule1",
            key: "key1",
            policy: { name: Algorithm.FixedWindow, window: 60, limit: 100 },
          },
          {
            name: "rule2",
            key: "key2",
            policy: { name: Algorithm.FixedWindow, window: 60, limit: 100 },
          },
        ],
        store,
      });

      await rateLimiter.consume({});

      // Should call store.consume for both rules
      expect(storeSpy).toHaveBeenCalledTimes(2);
    });

    it("should return the last rule result when all succeed", async () => {
      jest
        .spyOn(store, "consume")
        .mockResolvedValueOnce({
          allowed: true,
          remaining: 50,
          reset: Date.now(),
        })
        .mockResolvedValueOnce({
          allowed: true,
          remaining: 100,
          reset: Date.now() + 120000,
        });

      const rateLimiter = new RateLimiter({
        rules: [
          {
            name: "rule1",
            key: "key1",
            policy: { name: Algorithm.FixedWindow, window: 60, limit: 100 },
          },
          {
            name: "rule2",
            key: "key2",
            policy: { name: Algorithm.FixedWindow, window: 120, limit: 200 },
          },
        ],
        store,
      });

      const result = await rateLimiter.consume({});

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(100);
    });
  });
});
