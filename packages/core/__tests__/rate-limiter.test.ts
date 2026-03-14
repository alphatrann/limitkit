import { RateLimiter } from "../src/rate-limiter";
import {
  Algorithm,
  DebugLimitResult,
  FixedWindowConfig,
  LimitRule,
  Store,
} from "../src/types";
import { BadArgumentsException, EmptyRulesException } from "../src/exceptions";
import { MockStore, SpyStore } from "../__mocks__";
import { FixedWindow } from "../src";

class MockFixedWindow extends FixedWindow {}

describe("RateLimiter", () => {
  let store: MockStore;

  beforeEach(() => {
    store = new MockStore();
  });

  describe("initialization", () => {
    it("should throw EmptyRulesException when rules array is empty", () => {
      expect(() => {
        new RateLimiter({
          store,
          rules: [],
        });
      }).toThrow(EmptyRulesException);
    });

    it("should create a limiter with valid rules", () => {
      const rules: LimitRule[] = [
        {
          name: "test",
          key: "test-key",
          policy: new MockFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 100,
          }),
        },
      ];

      const limiter = new RateLimiter({ store, rules });
      expect(limiter).toBeInstanceOf(RateLimiter);
    });

    it("should accept debug flag", () => {
      const rules: LimitRule[] = [
        {
          name: "test",
          key: "test-key",
          policy: new MockFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 100,
          }),
        },
      ];

      const limiter = new RateLimiter({ store, rules, debug: true });
      expect(limiter.config.debug).toBe(true);
    });
  });

  describe("key resolution", () => {
    it("should resolve fixed string keys", async () => {
      const spyStore = new SpyStore(store);
      const rules: LimitRule<{ userId: string }>[] = [
        {
          name: "fixed-key",
          key: "static-key",
          policy: new MockFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 100,
          }),
        },
      ];

      const limiter = new RateLimiter({ store: spyStore, rules });
      await limiter.consume({ userId: "user-123" });

      expect(spyStore.calls[0].key).toContain("static-key");
    });

    it("should resolve dynamic keys from context", async () => {
      const spyStore = new SpyStore(store);
      const rules: LimitRule<{ userId: string }>[] = [
        {
          name: "dynamic-key",
          key: (ctx) => ctx.userId,
          policy: new MockFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 100,
          }),
        },
      ];

      const limiter = new RateLimiter({ store: spyStore, rules });
      await limiter.consume({ userId: "user-456" });

      expect(spyStore.calls[0].key).toContain("user-456");
    });

    it("should resolve async keys from context", async () => {
      const spyStore = new SpyStore(store);
      const rules: LimitRule<{ userId: string }>[] = [
        {
          name: "async-key",
          key: async (ctx) => {
            // Simulate async operation
            await Promise.resolve();
            return ctx.userId;
          },
          policy: new MockFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 100,
          }),
        },
      ];

      const limiter = new RateLimiter({ store: spyStore, rules });
      await limiter.consume({ userId: "async-user-789" });

      expect(spyStore.calls[0].key).toContain("async-user-789");
    });

    it("should use different keys for different contexts", async () => {
      const spyStore = new SpyStore(store);
      const rules: LimitRule<{ userId: string }>[] = [
        {
          name: "dynamic-key",
          key: (ctx) => ctx.userId,
          policy: new MockFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 100,
          }),
        },
      ];

      const limiter = new RateLimiter({ store: spyStore, rules });

      await limiter.consume({ userId: "user-1" });
      await limiter.consume({ userId: "user-2" });

      const key1 = spyStore.calls[0].key;
      const key2 = spyStore.calls[1].key;

      expect(key1).not.toEqual(key2);
      expect(key1).toContain("user-1");
      expect(key2).toContain("user-2");
    });
  });

  describe("cost resolution", () => {
    it("should use default cost of 1 when not specified", async () => {
      const spyStore = new SpyStore(store);
      const rules: LimitRule[] = [
        {
          name: "no-cost",
          key: "test-key",
          policy: new MockFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 100,
          }),
        },
      ];

      const limiter = new RateLimiter({ store: spyStore, rules });
      await limiter.consume({});

      expect(spyStore.calls[0].cost).toBe(1);
    });

    it("should resolve fixed number costs", async () => {
      const spyStore = new SpyStore(store);
      const rules: LimitRule[] = [
        {
          name: "fixed-cost",
          key: "test-key",
          cost: 5,
          policy: new MockFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 100,
          }),
        },
      ];

      const limiter = new RateLimiter({ store: spyStore, rules });
      await limiter.consume({});

      expect(spyStore.calls[0].cost).toBe(5);
    });

    it("should resolve dynamic costs from context", async () => {
      const spyStore = new SpyStore(store);
      const rules: LimitRule<{ requestSize: number }>[] = [
        {
          name: "dynamic-cost",
          key: "test-key",
          cost: (ctx) => ctx.requestSize,
          policy: new MockFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 100,
          }),
        },
      ];

      const limiter = new RateLimiter({ store: spyStore, rules });
      await limiter.consume({ requestSize: 10 });

      expect(spyStore.calls[0].cost).toBe(10);
    });

    it("should resolve async costs from context", async () => {
      const spyStore = new SpyStore(store);
      const rules: LimitRule<{ documentId: string }>[] = [
        {
          name: "async-cost",
          key: "test-key",
          cost: async (ctx) => {
            // Simulate async cost calculation
            await Promise.resolve();
            return ctx.documentId === "large" ? 5 : 1;
          },
          policy: new MockFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 100,
          }),
        },
      ];

      const limiter = new RateLimiter({ store: spyStore, rules });
      await limiter.consume({ documentId: "large" });

      expect(spyStore.calls[0].cost).toBe(5);
    });

    it("should throw BadArgumentsException for negative cost", async () => {
      const rules: LimitRule<{ cost: number }>[] = [
        {
          name: "negative-cost",
          key: "test-key",
          cost: (ctx) => ctx.cost,
          policy: new MockFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 100,
          }),
        },
      ];

      const limiter = new RateLimiter({ store, rules });

      await expect(limiter.consume({ cost: -1 })).rejects.toThrow(
        BadArgumentsException,
      );
    });
  });

  describe("policy resolution", () => {
    it("should resolve fixed policy objects", async () => {
      const spyStore = new SpyStore(store);
      const fixedPolicy: FixedWindowConfig = {
        name: "fixed-window",
        window: 60,
        limit: 100,
      };

      const rules: LimitRule[] = [
        {
          name: "fixed-policy",
          key: "test-key",
          policy: new MockFixedWindow(fixedPolicy),
        },
      ];

      const limiter = new RateLimiter({ store: spyStore, rules });
      await limiter.consume({});

      expect(spyStore.calls[0].algorithm).toEqual(fixedPolicy);
    });

    it("should resolve dynamic policies from context", async () => {
      const spyStore = new SpyStore(store);
      const rules: LimitRule<{ isPremium: boolean }>[] = [
        {
          name: "dynamic-policy",
          key: "test-key",
          policy: (ctx) =>
            new MockFixedWindow({
              name: "fixed-window",
              window: 60,
              limit: ctx.isPremium ? 1000 : 100,
            }),
        },
      ];

      const limiter = new RateLimiter({ store: spyStore, rules });

      await limiter.consume({ isPremium: false });
      expect((spyStore.calls[0].algorithm as FixedWindowConfig).limit).toBe(
        100,
      );

      spyStore.calls = [];

      await limiter.consume({ isPremium: true });
      expect((spyStore.calls[0].algorithm as FixedWindowConfig).limit).toBe(
        1000,
      );
    });

    it("should resolve async policies from context", async () => {
      const spyStore = new SpyStore(store);
      const rules: LimitRule<{ userId: string }>[] = [
        {
          name: "async-policy",
          key: (ctx) => ctx.userId,
          policy: async (ctx) => {
            // Simulate async policy lookup
            await Promise.resolve();
            return new MockFixedWindow({
              name: "fixed-window",
              window: 60,
              limit: ctx.userId === "vip" ? 10000 : 100,
            });
          },
        },
      ];

      const limiter = new RateLimiter({ store: spyStore, rules });
      await limiter.consume({ userId: "vip" });

      expect((spyStore.calls[0].algorithm as FixedWindowConfig).limit).toBe(
        10000,
      );
    });
  });

  describe("min/max stats calculation", () => {
    it("should return stats from single rule", async () => {
      jest.spyOn(store, "consume").mockResolvedValue({
        allowed: true,
        limit: 100,
        remaining: 50,
        reset: 1000,
      });

      const rules: LimitRule[] = [
        {
          name: "rule1",
          key: "key1",
          policy: new MockFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 100,
          }),
        },
      ];

      const limiter = new RateLimiter({ store, rules });
      const result = await limiter.consume({});

      expect(result.limit).toBe(100);
      expect(result.remaining).toBe(50);
      expect(result.reset).toBe(1000);
    });

    it("should return min remaining across multiple allowed rules", async () => {
      const mockStore = new (class implements Store {
        async consume(key: string, algorithm: any, now: number) {
          if (key.includes("user-limit")) {
            return {
              allowed: true,
              limit: 100,
              remaining: 20,
              reset: 1000,
            };
          } else if (key.includes("ip-limit")) {
            return {
              allowed: true,
              limit: 50,
              remaining: 45,
              reset: 2000,
            };
          }
          return {
            allowed: true,
            limit: 1000,
            remaining: 999,
            reset: 3000,
          };
        }
      })();

      const rules: LimitRule<{ userId: string; ip: string }>[] = [
        {
          name: "user-limit",
          key: (ctx) => `user-limit:${ctx.userId}`,
          policy: new MockFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 100,
          }),
        },
        {
          name: "ip-limit",
          key: (ctx) => `ip-limit:${ctx.ip}`,
          policy: new MockFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 50,
          }),
        },
        {
          name: "global-limit",
          key: "global",
          policy: new MockFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 1000,
          }),
        },
      ];

      const limiter = new RateLimiter({ store: mockStore, rules });
      const result = await limiter.consume({
        userId: "user-123",
        ip: "192.168.1.1",
      });

      expect(result.remaining).toBe(20); // min of 20, 45, 999
      expect(result.limit).toBe(50); // min of 100, 50, 1000
      expect(result.reset).toBe(3000); // max of 1000, 2000, 3000
    });

    it("should return max reset across multiple allowed rules", async () => {
      const mockStore = new (class implements Store {
        async consume(key: string, algorithm: any, now: number) {
          if (key.includes("rule1")) {
            return {
              allowed: true,
              limit: 100,
              remaining: 50,
              reset: 5000,
            };
          } else if (key.includes("rule2")) {
            return {
              allowed: true,
              limit: 100,
              remaining: 75,
              reset: 10000,
            };
          }
          return {
            allowed: true,
            limit: 100,
            remaining: 80,
            reset: 3000,
          };
        }
      })();

      const rules: LimitRule[] = [
        {
          name: "rule1",
          key: "rule1",
          policy: new MockFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 100,
          }),
        },
        {
          name: "rule2",
          key: "rule2",
          policy: new MockFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 100,
          }),
        },
        {
          name: "rule3",
          key: "rule3",
          policy: new MockFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 100,
          }),
        },
      ];

      const limiter = new RateLimiter({ store: mockStore, rules });
      const result = await limiter.consume({});

      expect(result.reset).toBe(10000); // max of 5000, 10000, 3000
    });
  });

  describe("allow behavior - evaluating all rules", () => {
    it("should evaluate all rules when all allow the request", async () => {
      const spyStore = new SpyStore(
        new (class implements Store {
          async consume() {
            return {
              allowed: true,
              limit: 100,
              remaining: 50,
              reset: 1000,
            };
          }
        })(),
      );

      const rules: LimitRule[] = [
        {
          name: "rule1",
          key: "key1",
          policy: new MockFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 100,
          }),
        },
        {
          name: "rule2",
          key: "key2",
          policy: new MockFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 100,
          }),
        },
        {
          name: "rule3",
          key: "key3",
          policy: new MockFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 100,
          }),
        },
      ];

      const limiter = new RateLimiter({ store: spyStore, rules });
      const result = await limiter.consume({});

      // All 3 rules should be evaluated
      expect(spyStore.calls).toHaveLength(3);
      expect(result.allowed).toBe(true);
    });

    it("should return allowed result from last rule when all pass", async () => {
      const mockStore = new (class implements Store {
        async consume(key: string, algorithm: any, now: number) {
          if (key.includes("rule1")) {
            return {
              allowed: true,
              limit: 100,
              remaining: 50,
              reset: 1000,
            };
          } else if (key.includes("rule2")) {
            return {
              allowed: true,
              limit: 200,
              remaining: 150,
              reset: 2000,
            };
          }
          return {
            allowed: true,
            limit: 300,
            remaining: 200,
            reset: 3000,
          };
        }
      })();

      const rules: LimitRule[] = [
        {
          name: "rule1",
          key: "rule1",
          policy: new MockFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 100,
          }),
        },
        {
          name: "rule2",
          key: "rule2",
          policy: new MockFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 200,
          }),
        },
        {
          name: "rule3",
          key: "rule3",
          policy: new MockFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 300,
          }),
        },
      ];

      const limiter = new RateLimiter({ store: mockStore, rules });
      const result = await limiter.consume({});

      // Result should have min/max aggregated values
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(100); // min limit
      expect(result.remaining).toBe(50); // min remaining
      expect(result.reset).toBe(3000); // max reset
    });
  });

  describe("reject behavior - stop evaluating remaining rules", () => {
    it("should stop evaluating rules when a rule is rejected", async () => {
      const spyStore = new SpyStore(
        new (class implements Store {
          async consume(key: string) {
            if (key.includes("rule2")) {
              return {
                allowed: false,
                limit: 100,
                remaining: 0,
                reset: 2000,
                retryAfter: 120,
              };
            }
            return {
              allowed: true,
              limit: 100,
              remaining: 50,
              reset: 1000,
            };
          }
        })(),
      );

      const rules: LimitRule[] = [
        {
          name: "rule1",
          key: "rule1",
          policy: new MockFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 100,
          }),
        },
        {
          name: "rule2",
          key: "rule2",
          policy: new MockFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 100,
          }),
        },
        {
          name: "rule3",
          key: "rule3",
          policy: new MockFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 100,
          }),
        },
      ];

      const limiter = new RateLimiter({ store: spyStore, rules });
      const result = await limiter.consume({});

      // Only rule1 and rule2 should be evaluated, rule3 should be skipped
      expect(spyStore.calls).toHaveLength(2);
      expect(result.allowed).toBe(false);
    });

    it("should return rejected response with correct stats", async () => {
      const mockStore = new (class implements Store {
        async consume(key: string) {
          if (key.includes("user-limit")) {
            return {
              allowed: false,
              limit: 100,
              remaining: 0,
              reset: 5000,
              retryAfter: 300,
            };
          }
          return {
            allowed: true,
            limit: 1000,
            remaining: 999,
            reset: 10000,
          };
        }
      })();

      const rules: LimitRule[] = [
        {
          name: "user-limit",
          key: "user-limit:123",
          policy: new MockFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 100,
          }),
        },
        {
          name: "global-limit",
          key: "global",
          policy: new MockFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 1000,
          }),
        },
      ];

      const limiter = new RateLimiter({ store: mockStore, rules });
      const result = await limiter.consume({});

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBe(300);
    });

    it("should reject on first rule without evaluating subsequent rules", async () => {
      const spyStore = new SpyStore(
        new (class implements Store {
          async consume(key: string) {
            if (key.includes("rule1")) {
              return {
                allowed: false,
                limit: 100,
                remaining: 0,
                reset: 1000,
              };
            }
            return {
              allowed: true,
              limit: 100,
              remaining: 50,
              reset: 2000,
            };
          }
        })(),
      );

      const rules: LimitRule[] = [
        {
          name: "rule1",
          key: "rule1",
          policy: new MockFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 100,
          }),
        },
        {
          name: "rule2",
          key: "rule2",
          policy: new MockFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 100,
          }),
        },
      ];

      const limiter = new RateLimiter({ store: spyStore, rules });
      await limiter.consume({});

      // Only rule1 should be evaluated
      expect(spyStore.calls).toHaveLength(1);
    });
  });

  describe("debug mode", () => {
    it("should return debug data when debug is enabled", async () => {
      const mockStore = new (class implements Store {
        async consume(key: string) {
          if (key.includes("rule1")) {
            return {
              allowed: true,
              limit: 100,
              remaining: 50,
              reset: 1000,
            };
          } else if (key.includes("rule2")) {
            return {
              allowed: true,
              limit: 100,
              remaining: 75,
              reset: 2000,
            };
          }
          return {
            allowed: true,
            limit: 100,
            remaining: 80,
            reset: 3000,
          };
        }
      })();

      const rules: LimitRule[] = [
        {
          name: "rule1",
          key: "rule1",
          policy: new MockFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 100,
          }),
        },
        {
          name: "rule2",
          key: "rule2",
          policy: new MockFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 100,
          }),
        },
        {
          name: "rule3",
          key: "rule3",
          policy: new MockFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 100,
          }),
        },
      ];

      const limiter = new RateLimiter({ store: mockStore, rules, debug: true });
      const result = (await limiter.consume({})) as DebugLimitResult;

      expect(result).toHaveProperty("details");
      expect(Array.isArray(result.details)).toBe(true);
    });

    it("should include all evaluated rules in debug details", async () => {
      const mockStore = new (class implements Store {
        async consume(key: string) {
          if (key.includes("rule1")) {
            return {
              allowed: true,
              limit: 100,
              remaining: 50,
              reset: 1000,
            };
          } else if (key.includes("rule2")) {
            return {
              allowed: true,
              limit: 100,
              remaining: 75,
              reset: 2000,
            };
          }
          return {
            allowed: true,
            limit: 100,
            remaining: 80,
            reset: 3000,
          };
        }
      })();

      const rules: LimitRule[] = [
        {
          name: "rule1",
          key: "rule1",
          policy: new MockFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 100,
          }),
        },
        {
          name: "rule2",
          key: "rule2",
          policy: new MockFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 100,
          }),
        },
        {
          name: "rule3",
          key: "rule3",
          policy: new MockFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 100,
          }),
        },
      ];

      const limiter = new RateLimiter({ store: mockStore, rules, debug: true });
      const result = (await limiter.consume({})) as DebugLimitResult;

      expect(result.details).toHaveLength(3);
      expect(result.details[0].name).toBe("rule1");
      expect(result.details[1].name).toBe("rule2");
      expect(result.details[2].name).toBe("rule3");
    });

    it("should include failedRule when request is rejected in debug mode", async () => {
      const mockStore = new (class implements Store {
        async consume(key: string) {
          if (key.includes("rule2")) {
            return {
              allowed: false,
              limit: 100,
              remaining: 0,
              reset: 2000,
            };
          }
          return {
            allowed: true,
            limit: 100,
            remaining: 50,
            reset: 1000,
          };
        }
      })();

      const rules: LimitRule[] = [
        {
          name: "rule1",
          key: "rule1",
          policy: new MockFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 100,
          }),
        },
        {
          name: "rule2",
          key: "rule2",
          policy: new MockFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 100,
          }),
        },
      ];

      const limiter = new RateLimiter({ store: mockStore, rules, debug: true });
      const result = await limiter.consume({});

      expect(result).toHaveProperty("failedRule");
      expect((result as DebugLimitResult).failedRule).toBe("rule2");
    });

    it("should log to console when debug is enabled and request is allowed", async () => {
      const consoleSpy = jest.spyOn(console, "log").mockImplementation();

      const mockStore = new (class implements Store {
        async consume() {
          return {
            allowed: true,
            limit: 100,
            remaining: 50,
            reset: 1000,
          };
        }
      })();

      const rules: LimitRule[] = [
        {
          name: "rule1",
          key: "rule1",
          policy: new MockFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 100,
          }),
        },
      ];

      const limiter = new RateLimiter({ store: mockStore, rules, debug: true });
      await limiter.consume({});

      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should log to console.error when debug is enabled and request is rejected", async () => {
      const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

      const mockStore = new (class implements Store {
        async consume() {
          return {
            allowed: false,
            limit: 100,
            remaining: 0,
            reset: 1000,
          };
        }
      })();

      const rules: LimitRule[] = [
        {
          name: "rule1",
          key: "rule1",
          policy: new MockFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 100,
          }),
        },
      ];

      const limiter = new RateLimiter({ store: mockStore, rules, debug: true });
      await limiter.consume({});

      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe("config getter and setter", () => {
    it("should get current config", () => {
      const rules: LimitRule[] = [
        {
          name: "rule1",
          key: "key1",
          policy: new MockFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 100,
          }),
        },
      ];

      const limiter = new RateLimiter({ store, rules, debug: true });

      expect(limiter.config).toEqual({ rules, store, debug: true });
    });
  });
});
