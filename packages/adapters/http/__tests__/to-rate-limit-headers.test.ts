import { toRateLimitHeaders } from '../src';

describe('toRateLimitHeaders', () => {
  const now = 1000;

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(now);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses most restrictive rule when allowed', () => {
    const r1 = {
      name: 'r1',
      limit: 10,
      remaining: 5,
      resetAt: 2000,
      allowed: true,
    };
    const r2 = {
      name: 'r2',
      limit: 10,
      remaining: 1,
      resetAt: 1500,
      allowed: true,
    };

    const result = {
      id: 'test',
      allowed: true,
      failedRule: null,
      rules: [r1, r2],
    };

    const headers = toRateLimitHeaders(result);

    expect(headers['RateLimit-Limit']).toBe(10);
    expect(headers['RateLimit-Remaining']).toBe(1);
    expect(headers['Reset-After']).toBe(Math.ceil((1500 - now) / 1000));
  });

  it('uses failed rule when rejected', () => {
    const r1 = {
      name: 'r1',
      limit: 10,
      remaining: 0,
      resetAt: 2000,
      allowed: false,
    };

    const result = {
      id: 'test',
      allowed: false,
      failedRule: 'r1',
      rules: [r1],
    };

    const headers = toRateLimitHeaders(result);

    expect(headers['RateLimit-Limit']).toBe(10);
    expect(headers['RateLimit-Remaining']).toBe(0);
  });

  it('includes Retry-After when availableAt is present', () => {
    const r1 = {
      name: 'r1',
      limit: 10,
      remaining: 0,
      resetAt: 2000,
      availableAt: 3000,
      allowed: false,
    };

    const result = {
      id: 'test',
      allowed: false,
      failedRule: 'r1',
      rules: [r1],
    };

    const headers = toRateLimitHeaders(result);

    expect(headers['Retry-After']).toBe(Math.ceil((3000 - now) / 1000));
  });

  it('returns an empty object when no rule governed the request (all skipped)', () => {
    const result = {
      id: 'test',
      allowed: true,
      failedRule: null,
      rules: [],
    };

    expect(toRateLimitHeaders(result)).toEqual({});
  });

  it('does not include Retry-After when availableAt is absent', () => {
    const r1 = {
      name: 'r1',
      limit: 10,
      remaining: 0,
      resetAt: 2000,
      allowed: false,
    };

    const result = {
      id: 'test',
      allowed: false,
      failedRule: 'r1',
      rules: [r1],
    };

    const headers = toRateLimitHeaders(result);

    expect(headers['Retry-After']).toBeUndefined();
  });

  it('emits per-policy RateLimit / RateLimit-Policy for every evaluated rule', () => {
    const result = {
      id: 'test',
      allowed: true,
      failedRule: null,
      rules: [
        {
          name: 'per-ip',
          limit: 100,
          remaining: 39,
          resetAt: 6000,
          allowed: true,
        },
        {
          name: 'per-user',
          limit: 1000,
          remaining: 490,
          resetAt: now + 54_221_000,
          allowed: true,
        },
      ],
    };

    const headers = toRateLimitHeaders(result);

    expect(headers['RateLimit']).toBe(
      '"per-ip";r=39;t=5, "per-user";r=490;t=54221',
    );
    expect(headers['RateLimit-Policy']).toBe(
      '"per-ip";q=100, "per-user";q=1000',
    );
    // legacy single-policy headers still point at the binding rule
    expect(headers['RateLimit-Remaining']).toBe(39);
  });

  it('omits the per-policy fields when no rule governed the request', () => {
    const headers = toRateLimitHeaders({
      id: 'test',
      allowed: true,
      failedRule: null,
      rules: [],
    });

    expect(headers['RateLimit']).toBeUndefined();
    expect(headers['RateLimit-Policy']).toBeUndefined();
  });

  it('reports the failed rule with r=0 in the per-policy field on a rejection', () => {
    const headers = toRateLimitHeaders({
      id: 'test',
      allowed: false,
      failedRule: 'burst',
      rules: [
        {
          name: 'sustained',
          limit: 100,
          remaining: 12,
          resetAt: 4000,
          allowed: true,
        },
        {
          name: 'burst',
          limit: 10,
          remaining: 0,
          resetAt: 3000,
          allowed: false,
        },
      ],
    });

    expect(headers['RateLimit']).toBe('"sustained";r=12;t=3, "burst";r=0;t=2');
  });
});
