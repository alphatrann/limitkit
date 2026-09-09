import { mostRestrictive } from '../src/utils/most-restrictive';

const rule = (over: Partial<Record<string, unknown>> = {}) => ({
  name: 'r',
  limit: 10,
  remaining: 5,
  resetAt: 1000,
  allowed: true,
  ...over,
});

const wrap = (rules: ReturnType<typeof rule>[]) => ({
  id: 'test',
  allowed: true,
  failedRule: null,
  rules,
});

describe('mostRestrictive', () => {
  it('returns null when no rules', () => {
    expect(mostRestrictive(wrap([]))).toBeNull();
  });

  it('returns the only rule if one exists', () => {
    const r = rule();
    expect(mostRestrictive(wrap([r]))).toEqual(r);
  });

  it('selects the rule with the fewest requests remaining', () => {
    const r1 = rule({ name: 'r1', remaining: 5 });
    const r2 = rule({ name: 'r2', remaining: 2 });
    expect(mostRestrictive(wrap([r1, r2]))).toEqual(r2);
  });

  it('compares remaining in absolute terms, not as a ratio', () => {
    // global limit has burned a bigger fraction but still has more headroom
    const global = rule({ name: 'global', limit: 10_000, remaining: 100 }); // ratio 0.01
    const perUser = rule({ name: 'per-user', limit: 20, remaining: 5 }); // ratio 0.25
    // the client is blocked after 5 more calls, not 100 → per-user governs
    expect(mostRestrictive(wrap([global, perUser]))).toEqual(perUser);
  });

  it('breaks ties on remaining using the later resetAt', () => {
    const r1 = rule({ name: 'r1', remaining: 2, resetAt: 1000 });
    const r2 = rule({ name: 'r2', remaining: 2, resetAt: 2000 });
    expect(mostRestrictive(wrap([r1, r2]))).toEqual(r2);
  });

  it('breaks remaining+resetAt ties using the lower limit', () => {
    const r1 = rule({ name: 'r1', remaining: 2, resetAt: 1000, limit: 100 });
    const r2 = rule({ name: 'r2', remaining: 2, resetAt: 1000, limit: 10 });
    expect(mostRestrictive(wrap([r1, r2]))).toEqual(r2);
  });
});
