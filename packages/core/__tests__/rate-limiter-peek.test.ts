import {
  FixedWindow,
  LimitEventName,
  RateLimiter,
  RateLimitObserver,
  RateLimitRuleResult,
  Store,
} from '../src';

class TestFixedWindow extends FixedWindow {}

const policy = new TestFixedWindow({
  name: 'fixed-window',
  window: 60,
  limit: 10,
});

const result = (allowed: boolean): RateLimitRuleResult => ({
  allowed,
  limit: 10,
  remaining: allowed ? 5 : 0,
  resetAt: 1000,
});

/** Store keys are namespaced `ratelimit:<rule name>:...`. */
const isRule = (key: string, name: string) =>
  key.startsWith(`ratelimit:${name}:`);

function makeStore(
  decide: (key: string) => boolean,
): jest.Mocked<Required<Store>> {
  return {
    consume: jest.fn(async (key: string) => result(decide(key))),
    peek: jest.fn(async (key: string) => result(decide(key))),
  } as unknown as jest.Mocked<Required<Store>>;
}

describe('RateLimiter.peek', () => {
  const rules = [
    { name: 'a', key: 'a', policy },
    { name: 'b', key: 'b', policy },
    { name: 'c', key: 'c', policy },
  ];

  it('reads through store.peek and never calls store.consume', async () => {
    const store = makeStore(() => true);
    const limiter = new RateLimiter({ rules, store });

    const res = await limiter.peek({});

    expect(res.allowed).toBe(true);
    expect(res.failedRule).toBeNull();
    expect(store.peek).toHaveBeenCalledTimes(3);
    expect(store.consume).not.toHaveBeenCalled();
  });

  it('does not short-circuit and reports the first rejecting rule', async () => {
    const store = makeStore((key) => !isRule(key, 'b') && !isRule(key, 'c'));
    const limiter = new RateLimiter({ rules, store });

    const res = await limiter.peek({});

    expect(res.allowed).toBe(false);
    expect(res.failedRule).toBe('b');
    expect(res.rules.map((r) => r.name)).toEqual(['a', 'b', 'c']);
    expect(store.peek).toHaveBeenCalledTimes(3);
  });

  it('consume still short-circuits on the first rejection', async () => {
    const store = makeStore((key) => !isRule(key, 'b'));
    const limiter = new RateLimiter({ rules, store });

    const res = await limiter.consume({});

    expect(res.failedRule).toBe('b');
    expect(store.consume).toHaveBeenCalledTimes(2);
  });

  it('passes the resolved cost to store.peek', async () => {
    const store = makeStore(() => true);
    const limiter = new RateLimiter({
      rules: [{ name: 'a', key: 'a', policy, cost: 3 }],
      store,
    });

    await limiter.peek({});

    expect(store.peek.mock.calls[0][3]).toBe(3);
  });

  it('respects `when` and `any` groups', async () => {
    const store = makeStore((key) => !isRule(key, 'x'));
    const limiter = new RateLimiter({
      rules: [
        { name: 'skipped', key: 's', policy, when: false },
        {
          name: 'either',
          mode: 'any',
          rules: [
            { name: 'x', key: 'x', policy },
            { name: 'y', key: 'y', policy },
          ],
        },
      ],
      store,
    });

    const res = await limiter.peek({});

    expect(res.allowed).toBe(true);
    expect(res.rules.map((r) => r.name)).toEqual(['x', 'y']);
  });

  it('throws a clear error when the store has no peek', async () => {
    const limiter = new RateLimiter({
      rules,
      store: { consume: jest.fn() },
    });

    await expect(limiter.peek({})).rejects.toThrow(
      'peek() is not supported by this store',
    );
  });

  it('is carried over by extend()', async () => {
    const store = makeStore(() => true);
    const extended = new RateLimiter({ rules: [rules[0]], store }).extend([
      rules[1],
    ]);

    const res = await extended.peek({});

    expect(res.rules).toHaveLength(2);
  });

  describe('observers', () => {
    function record(limiter: RateLimiter) {
      const names: LimitEventName[] = [];
      const methods: (keyof RateLimitObserver)[] = [
        'onConsumeStart',
        'onConsumeAllow',
        'onConsumeReject',
        'onConsumeError',
        'onPeekStart',
        'onPeekAllow',
        'onPeekReject',
        'onPeekError',
        'onRuleStart',
        'onRuleAllow',
        'onRuleReject',
        'onRuleSkip',
        'onRuleError',
      ];
      const observer: RateLimitObserver = {};
      for (const m of methods)
        (observer as any)[m] = () => names.push(m as any);
      limiter.subscribe(observer);
      return names;
    }

    it('emits only peek.start and peek.allow, with no consume.* or rule.*', async () => {
      const limiter = new RateLimiter({ rules, store: makeStore(() => true) });
      const calls = record(limiter);

      await limiter.peek({});

      expect(calls).toEqual(['onPeekStart', 'onPeekAllow']);
    });

    it('emits peek.reject when a rule would reject', async () => {
      const limiter = new RateLimiter({
        rules,
        store: makeStore(() => false),
      });
      const calls = record(limiter);

      await limiter.peek({});

      expect(calls).toEqual(['onPeekStart', 'onPeekReject']);
    });

    it('emits peek.error and rethrows when the store fails', async () => {
      const store = makeStore(() => true);
      store.peek.mockRejectedValueOnce(new Error('boom'));
      const limiter = new RateLimiter({ rules, store });
      const calls = record(limiter);

      await expect(limiter.peek({})).rejects.toThrow('boom');

      expect(calls).toEqual(['onPeekStart', 'onPeekError']);
    });
  });
});
