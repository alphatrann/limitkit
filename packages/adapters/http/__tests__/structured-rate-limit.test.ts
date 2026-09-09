import { RateLimitResult } from '@limitkit/core';
import {
  toRateLimitField,
  toRateLimitPolicyField,
} from '../src/utils/structured-rate-limit';

const wrap = (rules: Array<Record<string, unknown>>): RateLimitResult =>
  ({
    id: 'test',
    allowed: true,
    failedRule: null,
    rules,
  }) as unknown as RateLimitResult;

describe('toRateLimitField', () => {
  const now = 10_000;

  it('returns undefined when no rule was evaluated', () => {
    expect(toRateLimitField(wrap([]), now)).toBeUndefined();
  });

  it('serialises one member per rule as "<name>";r=<remaining>;t=<reset>', () => {
    const field = toRateLimitField(
      wrap([
        { name: 'a', limit: 10, remaining: 4, resetAt: now + 3000 },
        { name: 'b', limit: 5, remaining: 0, resetAt: now + 1200 },
      ]),
      now,
    );
    expect(field).toBe('"a";r=4;t=3, "b";r=0;t=2');
  });

  it('clamps remaining and time-to-reset to non-negative integers', () => {
    const field = toRateLimitField(
      wrap([{ name: 'a', limit: 10, remaining: -3, resetAt: now - 5000 }]),
      now,
    );
    expect(field).toBe('"a";r=0;t=0');
  });

  it('escapes " and \\ in the policy name and drops non-ASCII', () => {
    const field = toRateLimitField(
      wrap([{ name: 'a"b\\cé', limit: 1, remaining: 1, resetAt: now }]),
      now,
    );
    expect(field).toBe('"a\\"b\\\\c";r=1;t=0');
  });
});

describe('toRateLimitPolicyField', () => {
  it('returns undefined when no rule was evaluated', () => {
    expect(toRateLimitPolicyField(wrap([]))).toBeUndefined();
  });

  it('serialises one member per rule as "<name>";q=<limit> with no window', () => {
    const field = toRateLimitPolicyField(
      wrap([
        { name: 'a', limit: 100, remaining: 1, resetAt: 0 },
        { name: 'b', limit: 5, remaining: 1, resetAt: 0 },
      ]),
    );
    expect(field).toBe('"a";q=100, "b";q=5');
  });
});
