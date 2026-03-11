import { MockStore } from "../__mocks__";
import { BadArgumentsException, RateLimiter, addConfigToKey } from "../src";
import { EmptyRulesException } from "../src/exceptions/empty-rules-exception";
import { Algorithm, AlgorithmConfig } from "../src/types";

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

      const modifiedKey = addConfigToKey(policy, "key1");
      const rateLimiter = new RateLimiter({
        rules: [{ name: "rule1", key: "key1", policy }],
        store,
      });

      await rateLimiter.consume({});

      expect(storeSpy).toHaveBeenCalledWith(modifiedKey, policy, 1);
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

      const policy = { name: Algorithm.FixedWindow, window: 60, limit: 100 };
      const modifiedKey = addConfigToKey(policy, "static-key");
      const rateLimiter = new RateLimiter({
        rules: [
          {
            name: "rule1",
            key: "static-key",
            policy,
          },
        ],
        store,
      });

      await rateLimiter.consume({});

      expect(storeSpy).toHaveBeenCalledWith(modifiedKey, policy, 1);
    });

    it("should extract dynamic key from function", async () => {
      const keyResolver = jest.fn().mockReturnValue("dynamic-key-value");
      const storeSpy = jest.spyOn(store, "consume").mockResolvedValue({
        allowed: true,
        remaining: 50,
        reset: Date.now(),
      });

      const policy = { name: Algorithm.FixedWindow, window: 60, limit: 100 };
      const modifiedKey = addConfigToKey(policy, "dynamic-key-value");
      const ctx = { userId: "user-123" };
      const rateLimiter = new RateLimiter({
        rules: [
          {
            name: "rule1",
            key: keyResolver,
            policy,
          },
        ],
        store,
      });

      await rateLimiter.consume(ctx);

      expect(keyResolver).toHaveBeenCalledWith(ctx);
      expect(storeSpy).toHaveBeenCalledWith(modifiedKey, policy, 1);
    });
  });

  describe("cost extraction", () => {
    it("should throw a BadArgumentsException if cost is non-positive", async () => {
      const policy = { name: Algorithm.FixedWindow, window: 60, limit: 100 };
      const rateLimiter = new RateLimiter({
        rules: [
          {
            name: "rule1",
            key: "key1",
            policy,
            cost: -1,
          },
        ],
        store,
      });

      await expect(rateLimiter.consume({})).rejects.toThrow(
        BadArgumentsException,
      );
    });

    it("should use default cost of 1 when not specified", async () => {
      const storeSpy = jest.spyOn(store, "consume").mockResolvedValue({
        allowed: true,
        remaining: 50,
        reset: Date.now(),
      });

      const policy = { name: Algorithm.FixedWindow, window: 60, limit: 100 };
      const modifiedKey = addConfigToKey(policy, "key1");
      const rateLimiter = new RateLimiter({
        rules: [
          {
            name: "rule1",
            key: "key1",
            policy,
          },
        ],
        store,
      });

      await rateLimiter.consume({});

      expect(storeSpy).toHaveBeenCalledWith(modifiedKey, policy, 1);
    });

    it("should extract static cost", async () => {
      const storeSpy = jest.spyOn(store, "consume").mockResolvedValue({
        allowed: true,
        remaining: 50,
        reset: Date.now(),
      });

      const policy = { name: Algorithm.FixedWindow, window: 60, limit: 100 };
      const modifiedKey = addConfigToKey(policy, "key1");
      const rateLimiter = new RateLimiter({
        rules: [
          {
            name: "rule1",
            key: "key1",
            cost: 5,
            policy,
          },
        ],
        store,
      });

      await rateLimiter.consume({});

      expect(storeSpy).toHaveBeenCalledWith(modifiedKey, policy, 5);
    });

    it("should extract dynamic cost from function", async () => {
      const costResolver = jest.fn().mockReturnValue(10);
      const storeSpy = jest.spyOn(store, "consume").mockResolvedValue({
        allowed: true,
        remaining: 50,
        reset: Date.now(),
      });

      const policy = { name: Algorithm.FixedWindow, window: 60, limit: 100 };
      const modifiedKey = addConfigToKey(policy, "key1");
      const ctx = { multiplier: 2 };
      const rateLimiter = new RateLimiter({
        rules: [
          {
            name: "rule1",
            key: "key1",
            cost: costResolver,
            policy,
          },
        ],
        store,
      });

      await rateLimiter.consume(ctx);

      expect(costResolver).toHaveBeenCalledWith(ctx);
      expect(storeSpy).toHaveBeenCalledWith(modifiedKey, policy, 10);
    });
  });

  describe("store receives correct arguments", () => {
    it("should call store.consume with modified key, policy, and cost", async () => {
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
      const originalKey = "my-key";
      const modifiedKey = addConfigToKey(policy, originalKey);

      const rateLimiter = new RateLimiter({
        rules: [
          {
            name: "rule1",
            key: originalKey,
            cost: 3,
            policy,
          },
        ],
        store,
      });

      await rateLimiter.consume({});

      expect(storeSpy).toHaveBeenCalledTimes(1);
      expect(storeSpy).toHaveBeenCalledWith(modifiedKey, policy, 3);
    });

    it("should call store.consume for each rule with modified keys", async () => {
      const storeSpy = jest
        .spyOn(store, "consume")
        .mockResolvedValueOnce({
          allowed: true,
          remaining: 50,
          reset: Date.now(),
        })
        .mockResolvedValueOnce({
          allowed: true,
          remaining: 99,
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

      const modifiedKey1 = addConfigToKey(policy1, "key1");
      const modifiedKey2 = addConfigToKey(policy2, "key2");

      const rateLimiter = new RateLimiter({
        rules: [
          { name: "rule1", key: "key1", policy: policy1 },
          { name: "rule2", key: "key2", policy: policy2 },
        ],
        store,
      });

      await rateLimiter.consume({});

      expect(storeSpy).toHaveBeenCalledTimes(2);
      expect(storeSpy).toHaveBeenNthCalledWith(1, modifiedKey1, policy1, 1);
      expect(storeSpy).toHaveBeenNthCalledWith(2, modifiedKey2, policy2, 1);
    });
  });

  describe("key modification with addConfigToKey", () => {
    it("should apply addConfigToKey to static keys", async () => {
      const storeSpy = jest.spyOn(store, "consume").mockResolvedValue({
        allowed: true,
        remaining: 50,
        reset: Date.now(),
      });

      const policy: AlgorithmConfig = {
        name: Algorithm.FixedWindow,
        window: 60,
        limit: 100,
      };
      const staticKey = "user-123";
      const expectedModifiedKey = addConfigToKey(policy, staticKey);

      const rateLimiter = new RateLimiter({
        rules: [{ name: "rule1", key: staticKey, policy }],
        store,
      });

      await rateLimiter.consume({});

      expect(storeSpy).toHaveBeenCalledWith(expectedModifiedKey, policy, 1);
    });

    it("should apply addConfigToKey to dynamic keys from function", async () => {
      const storeSpy = jest.spyOn(store, "consume").mockResolvedValue({
        allowed: true,
        remaining: 50,
        reset: Date.now(),
      });

      const policy: AlgorithmConfig = {
        name: Algorithm.FixedWindow,
        window: 60,
        limit: 100,
      };
      const dynamicKey = "user-from-context";
      const expectedModifiedKey = addConfigToKey(policy, dynamicKey);

      const rateLimiter = new RateLimiter({
        rules: [
          {
            name: "rule1",
            key: () => dynamicKey,
            policy,
          },
        ],
        store,
      });

      await rateLimiter.consume({});

      expect(storeSpy).toHaveBeenCalledWith(expectedModifiedKey, policy, 1);
    });

    it("should create different modified keys for same original key with different policies", async () => {
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

      const policy1: AlgorithmConfig = {
        name: Algorithm.FixedWindow,
        window: 60,
        limit: 100,
      };
      const policy2: AlgorithmConfig = {
        name: Algorithm.FixedWindow,
        window: 60,
        limit: 200,
      };

      const originalKey = "same-key";
      const modifiedKey1 = addConfigToKey(policy1, originalKey);
      const modifiedKey2 = addConfigToKey(policy2, originalKey);

      expect(modifiedKey1).not.toBe(modifiedKey2);

      const rateLimiter = new RateLimiter({
        rules: [
          { name: "rule1", key: originalKey, policy: policy1 },
          { name: "rule2", key: originalKey, policy: policy2 },
        ],
        store,
      });

      await rateLimiter.consume({});

      expect(storeSpy).toHaveBeenNthCalledWith(1, modifiedKey1, policy1, 1);
      expect(storeSpy).toHaveBeenNthCalledWith(2, modifiedKey2, policy2, 1);
    });

    it("should create different modified keys for different original keys with same policy", async () => {
      const storeSpy = jest
        .spyOn(store, "consume")
        .mockResolvedValueOnce({
          allowed: true,
          remaining: 50,
          reset: Date.now(),
        })
        .mockResolvedValueOnce({
          allowed: true,
          remaining: 50,
          reset: Date.now(),
        });

      const policy: AlgorithmConfig = {
        name: Algorithm.FixedWindow,
        window: 60,
        limit: 100,
      };

      const modifiedKey1 = addConfigToKey(policy, "user-1");
      const modifiedKey2 = addConfigToKey(policy, "user-2");

      expect(modifiedKey1).not.toBe(modifiedKey2);

      const rateLimiter = new RateLimiter({
        rules: [
          { name: "rule1", key: "user-1", policy },
          { name: "rule2", key: "user-2", policy },
        ],
        store,
      });

      await rateLimiter.consume({});

      expect(storeSpy).toHaveBeenNthCalledWith(1, modifiedKey1, policy, 1);
      expect(storeSpy).toHaveBeenNthCalledWith(2, modifiedKey2, policy, 1);
    });

    it("should produce consistent modified keys across calls", async () => {
      const storeSpy = jest.spyOn(store, "consume").mockResolvedValue({
        allowed: true,
        remaining: 50,
        reset: Date.now(),
      });

      const policy: AlgorithmConfig = {
        name: Algorithm.FixedWindow,
        window: 60,
        limit: 100,
      };
      const key = "test-key";
      const expectedModifiedKey = addConfigToKey(policy, key);

      const rateLimiter = new RateLimiter({
        rules: [{ name: "rule1", key, policy }],
        store,
      });

      // Call consume multiple times
      await rateLimiter.consume({});
      await rateLimiter.consume({});
      await rateLimiter.consume({});

      // All calls should use the same modified key
      expect(storeSpy).toHaveBeenCalledTimes(3);
      expect(storeSpy).toHaveBeenNthCalledWith(
        1,
        expectedModifiedKey,
        policy,
        1,
      );
      expect(storeSpy).toHaveBeenNthCalledWith(
        2,
        expectedModifiedKey,
        policy,
        1,
      );
      expect(storeSpy).toHaveBeenNthCalledWith(
        3,
        expectedModifiedKey,
        policy,
        1,
      );
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
