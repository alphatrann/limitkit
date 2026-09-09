import {
  addConfigToKey,
  BadArgumentsException,
  EmptyRulesException,
  FixedWindow,
  RateLimiter,
  UndefinedKeyException,
} from '../src';

class TestFixedWindow extends FixedWindow {}

jest.mock('../src/utils/add-config-to-key', () => ({
  addConfigToKey: jest.fn(),
}));

describe('RateLimiter', () => {
  const mockStore = {
    consume: jest.fn(),
  };

  const mockAlgorithm = new TestFixedWindow({
    name: 'fixed-window',
    window: 60,
    limit: 10,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    (addConfigToKey as jest.Mock).mockImplementation(
      (config, key, scope) => `${scope}:${key}:${config.window}`,
    );
  });

  // -------------------------
  // constructor
  // -------------------------
  it('throws if rules are empty', () => {
    expect(() => {
      new RateLimiter({ rules: [], store: mockStore as any });
    }).toThrow(EmptyRulesException);
  });

  // -------------------------
  // key + cost validation
  // -------------------------
  it('throws if key is undefined', async () => {
    const limiter = new RateLimiter({
      rules: [
        {
          name: 'rule',
          key: () => undefined as any,
          policy: mockAlgorithm,
        },
      ],
      store: mockStore as any,
    });

    await expect(limiter.consume({})).rejects.toThrow(UndefinedKeyException);
  });

  it('throws if cost is negative', async () => {
    const limiter = new RateLimiter({
      rules: [
        {
          name: 'rule',
          key: 'key',
          cost: () => -1,
          policy: mockAlgorithm,
        },
      ],
      store: mockStore as any,
    });

    await expect(limiter.consume({})).rejects.toThrow(BadArgumentsException);
  });

  it('accepts a zero cost and never lets that rule reject', async () => {
    const limiter = new RateLimiter({
      rules: [
        {
          name: 'probe',
          key: 'key',
          cost: 0,
          policy: mockAlgorithm,
        },
      ],
      store: mockStore as any,
    });

    // Store reports the bucket as full, but a 0-cost rule must still pass.
    mockStore.consume.mockResolvedValue({
      allowed: false,
      limit: 10,
      remaining: 0,
      resetAt: 123,
      availableAt: 999,
    });

    const result = await limiter.consume({});

    expect(mockStore.consume).toHaveBeenCalledWith(
      expect.any(String),
      mockAlgorithm,
      expect.any(Number),
      0,
    );
    expect(result.allowed).toBe(true);
    expect(result.failedRule).toBeNull();
    // its standing is still reported, minus the stale retry hint
    expect(result.rules[0]).toMatchObject({
      name: 'probe',
      allowed: true,
      remaining: 0,
      limit: 10,
    });
    expect(result.rules[0].availableAt).toBeUndefined();
  });

  // -------------------------
  // static + dynamic evaluation
  // -------------------------
  it('evaluates static and dynamic key, cost, and policy', async () => {
    const limiter = new RateLimiter({
      rules: [
        {
          name: 'rule',
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

    await limiter.consume({ key: 'user', cost: 2 });

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
  it('calls addConfigToKey with correct arguments', async () => {
    const limiter = new RateLimiter({
      rules: [
        {
          name: 'rule',
          key: 'user',
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

    expect(addConfigToKey).toHaveBeenCalledWith(
      mockAlgorithm.config,
      'user',
      'rule',
    );
  });

  it('passes rule.bucket to addConfigToKey as the scope, falling back to name', async () => {
    const limiter = new RateLimiter({
      rules: [
        { name: 'reads', bucket: 'tenant', key: 'k', policy: mockAlgorithm },
        { name: 'writes', key: 'k', policy: mockAlgorithm },
      ],
      store: mockStore as any,
    });

    mockStore.consume.mockResolvedValue({
      allowed: true,
      limit: 10,
      remaining: 9,
      resetAt: 1,
    });

    await limiter.consume({});

    expect(addConfigToKey).toHaveBeenNthCalledWith(
      1,
      mockAlgorithm.config,
      'k',
      'tenant',
    );
    expect(addConfigToKey).toHaveBeenNthCalledWith(
      2,
      mockAlgorithm.config,
      'k',
      'writes',
    );
  });

  // -------------------------
  // store.consume
  // -------------------------
  it('calls store.consume with correct arguments', async () => {
    const limiter = new RateLimiter({
      rules: [
        {
          name: 'rule',
          key: 'user',
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
      'rule:user:60',
      mockAlgorithm,
      expect.any(Number),
      3,
    );
  });

  // -------------------------
  // evaluated rules
  // -------------------------
  it('appends evaluated rules correctly', async () => {
    const limiter = new RateLimiter({
      rules: [
        { name: 'r1', key: 'a', policy: mockAlgorithm },
        { name: 'r2', key: 'b', policy: mockAlgorithm },
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
    expect(result.rules[0].name).toBe('r1');
    expect(result.rules[1].name).toBe('r2');
  });

  // -------------------------
  // stop on failure
  // -------------------------
  it('stops evaluating rules when one fails', async () => {
    const limiter = new RateLimiter({
      rules: [
        { name: 'r1', key: 'a', policy: mockAlgorithm },
        { name: 'r2', key: 'b', policy: mockAlgorithm },
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
    expect(result.failedRule).toBe('r1');
    expect(result.rules).toHaveLength(1);

    expect(mockStore.consume).toHaveBeenCalledTimes(1);
  });

  // -------------------------
  // final result (allowed)
  // -------------------------
  it('returns correct result when all rules pass', async () => {
    const limiter = new RateLimiter({
      rules: [{ name: 'r1', key: 'a', policy: mockAlgorithm }],
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
      id: expect.any(String),
      allowed: true,
      failedRule: null,
      rules: [
        expect.objectContaining({
          name: 'r1',
          allowed: true,
        }),
      ],
    });
  });

  // -------------------------
  // final result (rejected)
  // -------------------------
  it('returns correct result when a rule fails', async () => {
    const limiter = new RateLimiter({
      rules: [{ name: 'r1', key: 'a', policy: mockAlgorithm }],
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
      id: expect.any(String),
      allowed: false,
      failedRule: 'r1',
      rules: [
        expect.objectContaining({
          name: 'r1',
          allowed: false,
        }),
      ],
    });
  });

  // -------------------------
  // when predicate
  // -------------------------
  describe('when predicate', () => {
    beforeEach(() => {
      mockStore.consume.mockResolvedValue({
        allowed: true,
        limit: 10,
        remaining: 9,
        resetAt: 1,
      });
    });

    it('skips a rule whose when resolves falsy: no key/policy/cost, no store call, absent from rules', async () => {
      const key = jest.fn(() => 'k');
      const cost = jest.fn(() => 1);
      const policy = jest.fn(() => mockAlgorithm);

      const limiter = new RateLimiter({
        rules: [{ name: 'gated', when: () => false, key, cost, policy }],
        store: mockStore as any,
      });

      const result = await limiter.consume({});

      expect(result.allowed).toBe(true);
      expect(result.failedRule).toBeNull();
      expect(result.rules).toHaveLength(0);
      expect(key).not.toHaveBeenCalled();
      expect(cost).not.toHaveBeenCalled();
      expect(policy).not.toHaveBeenCalled();
      expect(mockStore.consume).not.toHaveBeenCalled();
    });

    it('runs a rule whose when resolves truthy', async () => {
      const limiter = new RateLimiter({
        rules: [
          { name: 'gated', when: () => true, key: 'k', policy: mockAlgorithm },
        ],
        store: mockStore as any,
      });

      const result = await limiter.consume({});

      expect(result.rules).toHaveLength(1);
      expect(mockStore.consume).toHaveBeenCalledTimes(1);
    });

    it('treats a bare false / true value like a predicate', async () => {
      const limiter = new RateLimiter({
        rules: [
          { name: 'off', when: false, key: 'k', policy: mockAlgorithm },
          { name: 'on', when: true, key: 'k', policy: mockAlgorithm },
        ],
        store: mockStore as any,
      });

      const result = await limiter.consume({});

      expect(result.rules.map((r) => r.name)).toEqual(['on']);
    });

    it('supports an async predicate and passes it the context', async () => {
      const when = jest.fn(async (ctx: any) => ctx.enabled);
      const limiter = new RateLimiter({
        rules: [{ name: 'gated', when, key: 'k', policy: mockAlgorithm }],
        store: mockStore as any,
      });

      const result = await limiter.consume({ enabled: false });

      expect(when).toHaveBeenCalledWith({ enabled: false });
      expect(result.rules).toHaveLength(0);
    });

    it('allows the request when every rule is skipped', async () => {
      const limiter = new RateLimiter({
        rules: [
          { name: 'a', when: false, key: 'k', policy: mockAlgorithm },
          { name: 'b', when: () => false, key: 'k', policy: mockAlgorithm },
        ],
        store: mockStore as any,
      });

      const result = await limiter.consume({});

      expect(result).toMatchObject({
        allowed: true,
        failedRule: null,
        rules: [],
      });
    });

    it('still evaluates later rules after a skip', async () => {
      const limiter = new RateLimiter({
        rules: [
          { name: 'skipped', when: false, key: 'k', policy: mockAlgorithm },
          { name: 'live', key: 'k', policy: mockAlgorithm },
        ],
        store: mockStore as any,
      });

      const result = await limiter.consume({});

      expect(result.rules.map((r) => r.name)).toEqual(['live']);
      expect(mockStore.consume).toHaveBeenCalledTimes(1);
    });

    it('propagates an error thrown by the when predicate', async () => {
      const boom = new Error('predicate blew up');
      const limiter = new RateLimiter({
        rules: [
          {
            name: 'gated',
            when: () => {
              throw boom;
            },
            key: 'k',
            policy: mockAlgorithm,
          },
        ],
        store: mockStore as any,
      });

      await expect(limiter.consume({})).rejects.toBe(boom);
    });
  });
});
