import { FixedWindow, LimitRule, RateLimiter, RuleOrGroup } from '../src';

class TestFixedWindow extends FixedWindow {}

const policy = new TestFixedWindow({
  name: 'fixed-window',
  window: 60,
  limit: 10,
});

const rule = (name: string, extra: Partial<LimitRule> = {}): LimitRule => ({
  name,
  key: name,
  policy,
  ...extra,
});

describe('RateLimiter rule groups', () => {
  // Rules named in `rejecting` are rejected by the store; all others allow.
  const makeLimiter = (rules: RuleOrGroup<unknown>[], rejecting: string[]) => {
    const store = {
      consume: jest.fn(async (key: string) => ({
        allowed: !rejecting.some((n) => key.startsWith(`ratelimit:${n}:`)),
        limit: 10,
        remaining: 0,
        resetAt: 0,
      })),
    };
    return { limiter: new RateLimiter({ rules, store }), store };
  };

  it('any: allows when one child allows, but still evaluates every child', async () => {
    const { limiter, store } = makeLimiter(
      [{ mode: 'any', rules: [rule('a'), rule('b')] }],
      ['a'],
    );
    const result = await limiter.consume({});
    expect(result.allowed).toBe(true);
    expect(result.failedRule).toBeNull();
    expect(store.consume).toHaveBeenCalledTimes(2);
    expect(result.rules.map((r) => r.name)).toEqual(['a', 'b']);
  });

  it('any: rejects only when every child rejects, reporting the first rejected child', async () => {
    const { limiter } = makeLimiter(
      [{ mode: 'any', rules: [rule('a'), rule('b')] }],
      ['a', 'b'],
    );
    const result = await limiter.consume({});
    expect(result.allowed).toBe(false);
    expect(result.failedRule).toBe('a');
    expect(result.rules).toHaveLength(2);
  });

  it('any: reports the group name as failedRule when named', async () => {
    const { limiter } = makeLimiter(
      [{ mode: 'any', name: 'budgets', rules: [rule('a'), rule('b')] }],
      ['a', 'b'],
    );
    expect((await limiter.consume({})).failedRule).toBe('budgets');
  });

  it('all: short-circuits on the first reject', async () => {
    const { limiter, store } = makeLimiter(
      [{ mode: 'all', rules: [rule('a'), rule('b')] }],
      ['a'],
    );
    const result = await limiter.consume({});
    expect(result.failedRule).toBe('a');
    expect(store.consume).toHaveBeenCalledTimes(1);
  });

  it('a rejecting group short-circuits the remaining top-level rules', async () => {
    const { limiter, store } = makeLimiter(
      [{ mode: 'any', rules: [rule('a'), rule('b')] }, rule('c')],
      ['a', 'b'],
    );
    await limiter.consume({});
    expect(store.consume).toHaveBeenCalledTimes(2);
  });

  it('nests groups', async () => {
    // any( all(a, b), c ): a rejects so the all fails, but c allows
    const { limiter } = makeLimiter(
      [
        {
          mode: 'any',
          rules: [{ mode: 'all', rules: [rule('a'), rule('b')] }, rule('c')],
        },
      ],
      ['a'],
    );
    const result = await limiter.consume({});
    expect(result.allowed).toBe(true);
    expect(result.rules.map((r) => r.name)).toEqual(['a', 'c']);
  });

  it('skipped children are neutral inside an any group', async () => {
    const { limiter } = makeLimiter(
      [
        {
          mode: 'any',
          rules: [rule('a'), rule('b', { when: false })],
        },
      ],
      ['a'],
    );
    const result = await limiter.consume({});
    expect(result.allowed).toBe(false);
    expect(result.failedRule).toBe('a');
  });

  it('a group whose children are all skipped allows', async () => {
    const { limiter, store } = makeLimiter(
      [{ mode: 'any', rules: [rule('a', { when: false })] }],
      [],
    );
    expect((await limiter.consume({})).allowed).toBe(true);
    expect(store.consume).not.toHaveBeenCalled();
  });

  it('group `when` skips every child', async () => {
    const { limiter, store } = makeLimiter(
      [{ mode: 'any', when: () => false, rules: [rule('a')] }, rule('z')],
      ['a'],
    );
    const result = await limiter.consume({});
    expect(result.allowed).toBe(true);
    expect(store.consume).toHaveBeenCalledTimes(1);
  });

  it('propagates errors thrown inside a group', async () => {
    const { limiter, store } = makeLimiter(
      [{ mode: 'any', rules: [rule('a')] }],
      [],
    );
    const boom = new Error('boom');
    store.consume.mockRejectedValueOnce(boom);
    await expect(limiter.consume({})).rejects.toBe(boom);
  });
});

describe('RateLimiter.extend', () => {
  const store = {
    consume: jest.fn(async () => ({
      allowed: true,
      limit: 10,
      remaining: 5,
      resetAt: 0,
    })),
  };

  it('returns a new limiter with rules appended, sharing store and observers', async () => {
    const observer = { onConsumeStart: jest.fn() };
    const base = new RateLimiter({
      rules: [rule('a')],
      store,
      observers: [observer],
    });
    const extended = base.extend([rule('b')]);

    expect(extended).not.toBe(base);
    expect(base.config.rules).toHaveLength(1);
    expect(extended.config.rules.map((r) => (r as LimitRule).name)).toEqual([
      'a',
      'b',
    ]);
    expect(extended.config.store).toBe(store);

    const result = await extended.consume({});
    expect(result.rules.map((r) => r.name)).toEqual(['a', 'b']);
    expect(observer.onConsumeStart).toHaveBeenCalledTimes(1);
  });

  it('narrows the context type', async () => {
    const base = new RateLimiter<{ ip: string }>({
      rules: [rule('a')],
      store,
    });
    const authed = base.extend<{ ip: string; userId: string }>([
      { ...rule('b'), key: (c) => c.userId },
    ]);
    await expect(
      authed.consume({ ip: '1', userId: 'u' }),
    ).resolves.toBeDefined();
    // Compile-time only: never invoked.
    const _typeCheck = () =>
      // @ts-expect-error userId is required by the extended limiter
      authed.consume({ ip: '1' });
    void _typeCheck;
  });

  it('accepts groups', async () => {
    const base = new RateLimiter({ rules: [rule('a')], store });
    const extended = base.extend([{ mode: 'any', rules: [rule('b')] }]);
    expect((await extended.consume({})).allowed).toBe(true);
  });
});
