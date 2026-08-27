import {
  FixedWindow,
  LimitEventName,
  RateLimiter,
  RateLimitObserver,
  UndefinedKeyException,
} from '../src';

class TestFixedWindow extends FixedWindow {}

const policy = new TestFixedWindow({
  name: 'fixed-window',
  window: 60,
  limit: 10,
});

const allow = (remaining = 9) => ({
  allowed: true,
  limit: 10,
  remaining,
  resetAt: 1000,
});

const reject = () => ({
  allowed: false,
  limit: 10,
  remaining: 0,
  resetAt: 1000,
});

/**
 * Records every observer call as `[eventName, payload]` so tests can assert on
 * ordering and payload shape.
 */
class RecordingObserver implements RateLimitObserver {
  calls: Array<{ name: LimitEventName; payload: any }> = [];

  private record(name: LimitEventName) {
    return (payload: any) => this.calls.push({ name, payload });
  }

  onConsumeStart = this.record('consume.start');
  onConsumeAllow = this.record('consume.allow');
  onConsumeReject = this.record('consume.reject');
  onConsumeError = this.record('consume.error');
  onRuleStart = this.record('rule.start');
  onRuleAllow = this.record('rule.allow');
  onRuleReject = this.record('rule.reject');
  onRuleError = this.record('rule.error');

  get names() {
    return this.calls.map((c) => c.name);
  }

  payloadFor(name: LimitEventName) {
    return this.calls.find((c) => c.name === name)?.payload;
  }
}

describe('RateLimiter lifecycle events', () => {
  const makeStore = () => ({ consume: jest.fn() });

  it('emits start -> rule.start/allow per rule -> consume.allow, sharing one id', async () => {
    const store = makeStore();
    store.consume
      .mockResolvedValueOnce(allow(9))
      .mockResolvedValueOnce(allow(4));

    const observer = new RecordingObserver();
    const limiter = new RateLimiter({
      store: store as any,
      rules: [
        { name: 'r1', key: 'a', policy },
        { name: 'r2', key: 'b', policy },
      ],
      observers: [observer],
    });

    const result = await limiter.consume({});

    expect(observer.names).toEqual([
      'consume.start',
      'rule.start',
      'rule.allow',
      'rule.start',
      'rule.allow',
      'consume.allow',
    ]);

    const ids = new Set(observer.calls.map((c) => c.payload.event.id));
    expect(ids).toEqual(new Set([result.id]));
    expect(typeof result.id).toBe('string');
    expect(result.id.length).toBeGreaterThan(0);
  });

  it('populates the rule.allow payload with resolved key, cost, policy, result and duration', async () => {
    const store = makeStore();
    store.consume.mockResolvedValue(allow(7));

    const observer = new RecordingObserver();
    const limiter = new RateLimiter({
      store: store as any,
      rules: [{ name: 'r1', key: (ctx: any) => ctx.user, cost: 3, policy }],
      observers: [observer],
    });

    await limiter.consume({ user: 'alice' });

    const ruleAllow = observer.payloadFor('rule.allow');
    expect(ruleAllow.event).toMatchObject({
      ruleName: 'r1',
      key: 'alice',
      cost: 3,
      policy: policy.config,
    });
    expect(ruleAllow.result.remaining).toBe(7);
    expect(typeof ruleAllow.durationMs).toBe('number');
    expect(ruleAllow.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('defaults cost to 1 in the rule payload', async () => {
    const store = makeStore();
    store.consume.mockResolvedValue(allow());

    const observer = new RecordingObserver();
    const limiter = new RateLimiter({
      store: store as any,
      rules: [{ name: 'r1', key: 'a', policy }],
      observers: [observer],
    });

    await limiter.consume({});

    expect(observer.payloadFor('rule.allow').event.cost).toBe(1);
  });

  it('short-circuits on reject: later rules emit nothing and consume.reject carries the failed result', async () => {
    const store = makeStore();
    store.consume
      .mockResolvedValueOnce(allow())
      .mockResolvedValueOnce(reject());

    const observer = new RecordingObserver();
    const limiter = new RateLimiter({
      store: store as any,
      rules: [
        { name: 'r1', key: 'a', policy },
        { name: 'r2', key: 'b', policy },
        { name: 'r3', key: 'c', policy },
      ],
      observers: [observer],
    });

    const result = await limiter.consume({});

    expect(observer.names).toEqual([
      'consume.start',
      'rule.start',
      'rule.allow',
      'rule.start',
      'rule.reject',
      'consume.reject',
    ]);
    expect(store.consume).toHaveBeenCalledTimes(2);

    const consumeReject = observer.payloadFor('consume.reject');
    expect(consumeReject.result).toBe(result);
    expect(result.allowed).toBe(false);
    expect(result.failedRule).toBe('r2');
    expect(typeof consumeReject.durationMs).toBe('number');
  });

  it('emits rule.error + consume.error when the store throws, then rethrows the original error', async () => {
    const store = makeStore();
    const boom = new Error('redis down');
    store.consume.mockRejectedValue(boom);

    const observer = new RecordingObserver();
    const limiter = new RateLimiter({
      store: store as any,
      rules: [{ name: 'r1', key: 'a', policy }],
      observers: [observer],
    });

    await expect(limiter.consume({})).rejects.toBe(boom);

    expect(observer.names).toEqual([
      'consume.start',
      'rule.start',
      'rule.error',
      'consume.error',
    ]);

    const ruleError = observer.payloadFor('rule.error');
    expect(ruleError.failure).toEqual({ ruleName: 'r1', error: boom });
    expect(ruleError.event.key).toBe('a');
    expect(ruleError.event.policy).toEqual(policy.config);
    expect(typeof ruleError.durationMs).toBe('number');

    expect(observer.payloadFor('consume.error').failure.error).toBe(boom);
  });

  it('emits rule.error with a partial event when key resolution fails (rule.start already fired)', async () => {
    const store = makeStore();

    const observer = new RecordingObserver();
    const limiter = new RateLimiter({
      store: store as any,
      rules: [{ name: 'r1', key: () => undefined as any, policy }],
      observers: [observer],
    });

    await expect(limiter.consume({})).rejects.toThrow(UndefinedKeyException);

    expect(observer.names).toEqual([
      'consume.start',
      'rule.start',
      'rule.error',
      'consume.error',
    ]);

    const ruleError = observer.payloadFor('rule.error');
    expect(ruleError.event.key).toBeUndefined();
    expect(ruleError.event.cost).toBeUndefined();
    // policy resolves before the key, so it is present
    expect(ruleError.event.policy).toEqual(policy.config);
    expect(store.consume).not.toHaveBeenCalled();
  });

  it('isolates a throwing observer: onObserverError is called, other observers still run, result is unchanged', async () => {
    const store = makeStore();
    store.consume.mockResolvedValue(allow());

    const onObserverError = jest.fn();
    const broken: RateLimitObserver = {
      onRuleAllow: () => {
        throw new Error('observer blew up');
      },
      onObserverError,
    };
    const healthy = new RecordingObserver();

    const limiter = new RateLimiter({
      store: store as any,
      rules: [{ name: 'r1', key: 'a', policy }],
      observers: [broken, healthy],
    });

    const result = await limiter.consume({});

    expect(result.allowed).toBe(true);
    expect(onObserverError).toHaveBeenCalledWith(
      expect.any(Error),
      'rule.allow',
    );
    expect(healthy.names).toContain('rule.allow');
    expect(healthy.names).toContain('consume.allow');
  });

  it('swallows an onObserverError that itself throws', async () => {
    const store = makeStore();
    store.consume.mockResolvedValue(allow());

    const limiter = new RateLimiter({
      store: store as any,
      rules: [{ name: 'r1', key: 'a', policy }],
      observers: [
        {
          onRuleAllow: () => {
            throw new Error('handler');
          },
          onObserverError: () => {
            throw new Error('and the error handler too');
          },
        },
      ],
    });

    await expect(limiter.consume({})).resolves.toMatchObject({ allowed: true });
  });

  it('subscribe() returns a disposer that removes the observer', async () => {
    const store = makeStore();
    store.consume.mockResolvedValue(allow());

    const observer = new RecordingObserver();
    const limiter = new RateLimiter({
      store: store as any,
      rules: [{ name: 'r1', key: 'a', policy }],
    });

    const unsubscribe = limiter.subscribe(observer);
    await limiter.consume({});
    expect(observer.calls.length).toBeGreaterThan(0);

    const seen = observer.calls.length;
    unsubscribe();
    await limiter.consume({});
    expect(observer.calls.length).toBe(seen);
  });

  it('carries observers through an Express-style clone from limiter.config', async () => {
    const store = makeStore();
    store.consume.mockResolvedValue(allow());

    const observer = new RecordingObserver();
    const base = new RateLimiter({
      store: store as any,
      rules: [{ name: 'r1', key: 'a', policy }],
      observers: [observer],
    });

    const cloned = new RateLimiter({
      ...base.config,
      rules: base.config.rules,
    });
    await cloned.consume({});

    expect(observer.names).toContain('consume.allow');
  });
});
