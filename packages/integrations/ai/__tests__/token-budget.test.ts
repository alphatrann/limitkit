import { BadArgumentsException } from '@limitkit/core';
import {
  monthlyTokenBudget,
  sessionTokenBudget,
  tokenBudget,
  TOKEN_BUDGET_PERIODS,
  weeklyTokenBudget,
} from '../src';

describe('tokenBudget', () => {
  it('spreads the budget across the period as a per-second refill rate', () => {
    expect(tokenBudget({ tokens: 3_600, period: 3_600 })).toEqual({
      capacity: 3_600,
      refillRate: 1,
    });
  });

  it('defaults capacity to the full budget so it can be spent up front', () => {
    expect(tokenBudget({ tokens: 500, period: 100 }).capacity).toBe(500);
  });

  it('caps capacity at burst when one is given', () => {
    const policy = tokenBudget({ tokens: 1_000, period: 100, burst: 250 });

    expect(policy.capacity).toBe(250);
    // The long-run rate is unchanged — only the bucket ceiling moved.
    expect(policy.refillRate).toBe(10);
  });

  it.each([
    ['tokens', { tokens: 0, period: 60 }],
    ['negative tokens', { tokens: -1, period: 60 }],
    ['period', { tokens: 10, period: 0 }],
    ['infinite tokens', { tokens: Infinity, period: 60 }],
    ['burst', { tokens: 10, period: 60, burst: 0 }],
  ])('rejects a non-positive %s', (_label, options) => {
    expect(() => tokenBudget(options)).toThrow(BadArgumentsException);
  });
});

describe('monthlyTokenBudget', () => {
  it('refills a 1M budget over 30 days', () => {
    const policy = monthlyTokenBudget({ tokens: 1_000_000 });

    expect(policy.capacity).toBe(1_000_000);
    expect(policy.refillRate).toBeCloseTo(1_000_000 / 2_592_000, 6);
    // ~0.386 tokens/sec — the arithmetic this preset exists to get right.
    expect(policy.refillRate).toBeCloseTo(0.3858, 3);
  });

  it('refills exactly the budget over one period', () => {
    const policy = monthlyTokenBudget({ tokens: 250_000 });

    expect(policy.refillRate * TOKEN_BUDGET_PERIODS.month).toBeCloseTo(
      250_000,
      6,
    );
  });

  it('accepts a burst ceiling', () => {
    expect(
      monthlyTokenBudget({ tokens: 1_000_000, burst: 50_000 }).capacity,
    ).toBe(50_000);
  });
});

describe('weeklyTokenBudget', () => {
  it('refills exactly the budget over seven days', () => {
    const policy = weeklyTokenBudget({ tokens: 700_000 });

    expect(policy.capacity).toBe(700_000);
    expect(policy.refillRate * TOKEN_BUDGET_PERIODS.week).toBeCloseTo(
      700_000,
      6,
    );
  });
});

describe('sessionTokenBudget', () => {
  it('defaults to a one-hour session', () => {
    const policy = sessionTokenBudget({ tokens: 3_600 });

    expect(policy.capacity).toBe(3_600);
    expect(policy.refillRate).toBe(1);
  });

  it('honours an explicit duration', () => {
    const policy = sessionTokenBudget({ tokens: 100_000, duration: 1_800 });

    expect(policy.refillRate).toBeCloseTo(100_000 / 1_800, 6);
  });

  it('rejects a non-positive duration', () => {
    expect(() => sessionTokenBudget({ tokens: 10, duration: 0 })).toThrow(
      BadArgumentsException,
    );
  });
});
