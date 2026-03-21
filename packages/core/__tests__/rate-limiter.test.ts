import {
  addConfigToKey,
  BadArgumentsException,
  EmptyRulesException,
  FixedWindow,
  RateLimiter,
  UndefinedKeyException,
} from "../src";

class TestFixedWindow extends FixedWindow {}

jest.mock("../src/utils/add-config-to-key", () => ({
  addConfigToKey: jest.fn(),
}));

describe("RateLimiter", () => {
  const mockStore = {
    consume: jest.fn(),
  };

  const mockAlgorithm = new TestFixedWindow({
    name: "fixed-window",
    window: 60,
    limit: 10,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (addConfigToKey as jest.Mock).mockImplementation(
      (config, key) => `${key}:${config.window}`,
    );
  });

  // -------------------------
  // constructor
  // -------------------------
  it("throws if rules are empty", () => {
    expect(() => {
      new RateLimiter({ rules: [], store: mockStore as any });
    }).toThrow(EmptyRulesException);
  });

  // -------------------------
  // key + cost validation
  // -------------------------
  it("throws if key is undefined", async () => {
    const limiter = new RateLimiter({
      rules: [
        {
          name: "rule",
          key: () => undefined as any,
          policy: mockAlgorithm,
        },
      ],
      store: mockStore as any,
    });

    await expect(limiter.consume({})).rejects.toThrow(UndefinedKeyException);
  });

  it("throws if cost is invalid", async () => {
    const limiter = new RateLimiter({
      rules: [
        {
          name: "rule",
          key: "key",
          cost: () => 0,
          policy: mockAlgorithm,
        },
      ],
      store: mockStore as any,
    });

    await expect(limiter.consume({})).rejects.toThrow(BadArgumentsException);
  });

  // -------------------------
  // static + dynamic evaluation
  // -------------------------
  it("evaluates static and dynamic key, cost, and policy", async () => {
    const limiter = new RateLimiter({
      rules: [
        {
          name: "rule",
          key: (ctx: any) => ctx.key,
          cost: (ctx: any) => ctx.cost,
          policy: async () => mockAlgorithm,
        },
      ],
      store: mockStore as any,
    });

    mockStore.consume.mockResolvedValue({
      allowed: true,
      limit: 10,
      remaining: 9,
      resetAt: 123,
    });

    await limiter.consume({ key: "user", cost: 2 });

    expect(mockStore.consume).toHaveBeenCalledWith(
      expect.any(String),
      mockAlgorithm,
      expect.any(Number),
      2,
    );
  });

  // -------------------------
  // addConfigToKey
  // -------------------------
  it("calls addConfigToKey with correct arguments", async () => {
    const limiter = new RateLimiter({
      rules: [
        {
          name: "rule",
          key: "user",
          policy: mockAlgorithm,
        },
      ],
      store: mockStore as any,
    });

    mockStore.consume.mockResolvedValue({
      allowed: true,
      limit: 10,
      remaining: 9,
      resetAt: 123,
    });

    await limiter.consume({});

    expect(addConfigToKey).toHaveBeenCalledWith(mockAlgorithm.config, "user");
  });

  // -------------------------
  // store.consume
  // -------------------------
  it("calls store.consume with correct arguments", async () => {
    const limiter = new RateLimiter({
      rules: [
        {
          name: "rule",
          key: "user",
          cost: 3,
          policy: mockAlgorithm,
        },
      ],
      store: mockStore as any,
    });

    mockStore.consume.mockResolvedValue({
      allowed: true,
      limit: 10,
      remaining: 7,
      resetAt: 123,
    });

    await limiter.consume({});

    expect(mockStore.consume).toHaveBeenCalledWith(
      "user:60",
      mockAlgorithm,
      expect.any(Number),
      3,
    );
  });

  // -------------------------
  // evaluated rules
  // -------------------------
  it("appends evaluated rules correctly", async () => {
    const limiter = new RateLimiter({
      rules: [
        { name: "r1", key: "a", policy: mockAlgorithm },
        { name: "r2", key: "b", policy: mockAlgorithm },
      ],
      store: mockStore as any,
    });

    mockStore.consume
      .mockResolvedValueOnce({
        allowed: true,
        limit: 10,
        remaining: 9,
        resetAt: 1,
      })
      .mockResolvedValueOnce({
        allowed: true,
        limit: 10,
        remaining: 8,
        resetAt: 2,
      });

    const result = await limiter.consume({});

    expect(result.rules).toHaveLength(2);
    expect(result.rules[0].name).toBe("r1");
    expect(result.rules[1].name).toBe("r2");
  });

  // -------------------------
  // stop on failure
  // -------------------------
  it("stops evaluating rules when one fails", async () => {
    const limiter = new RateLimiter({
      rules: [
        { name: "r1", key: "a", policy: mockAlgorithm },
        { name: "r2", key: "b", policy: mockAlgorithm },
      ],
      store: mockStore as any,
    });

    mockStore.consume
      .mockResolvedValueOnce({
        allowed: false,
        limit: 10,
        remaining: 0,
        resetAt: 1,
      })
      .mockResolvedValueOnce({
        allowed: true,
        limit: 10,
        remaining: 9,
        resetAt: 2,
      });

    const result = await limiter.consume({});

    expect(result.allowed).toBe(false);
    expect(result.failedRule).toBe("r1");
    expect(result.rules).toHaveLength(1);

    expect(mockStore.consume).toHaveBeenCalledTimes(1);
  });

  // -------------------------
  // final result (allowed)
  // -------------------------
  it("returns correct result when all rules pass", async () => {
    const limiter = new RateLimiter({
      rules: [{ name: "r1", key: "a", policy: mockAlgorithm }],
      store: mockStore as any,
    });

    mockStore.consume.mockResolvedValue({
      allowed: true,
      limit: 10,
      remaining: 9,
      resetAt: 1,
    });

    const result = await limiter.consume({});

    expect(result).toEqual({
      allowed: true,
      failedRule: null,
      rules: [
        expect.objectContaining({
          name: "r1",
          allowed: true,
        }),
      ],
    });
  });

  // -------------------------
  // final result (rejected)
  // -------------------------
  it("returns correct result when a rule fails", async () => {
    const limiter = new RateLimiter({
      rules: [{ name: "r1", key: "a", policy: mockAlgorithm }],
      store: mockStore as any,
    });

    mockStore.consume.mockResolvedValue({
      allowed: false,
      limit: 10,
      remaining: 0,
      resetAt: 1,
    });

    const result = await limiter.consume({});

    expect(result).toEqual({
      allowed: false,
      failedRule: "r1",
      rules: [
        expect.objectContaining({
          name: "r1",
          allowed: false,
        }),
      ],
    });
  });
});
