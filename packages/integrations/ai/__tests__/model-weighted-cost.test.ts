import { BadArgumentsException } from '@limitkit/core';
import { modelWeightedCost } from '../src';

interface Ctx {
  model: string;
  tokens: number;
}

const cost = modelWeightedCost<Ctx>({
  weights: { 'gpt-4o': 10, 'gpt-4o-mini': 1 },
  model: (ctx) => ctx.model,
  tokens: (ctx) => ctx.tokens,
});

describe('modelWeightedCost', () => {
  it('multiplies tokens by the model weight', () => {
    expect(cost({ model: 'gpt-4o', tokens: 100 })).toBe(1_000);
    expect(cost({ model: 'gpt-4o-mini', tokens: 100 })).toBe(100);
  });

  it('falls back to a default weight of 1 for an unknown model', () => {
    expect(cost({ model: 'some-new-model', tokens: 100 })).toBe(100);
  });

  it('charges an unknown model at the configured default weight', () => {
    const failClosed = modelWeightedCost<Ctx>({
      weights: { 'gpt-4o-mini': 1 },
      defaultWeight: 25,
      model: (ctx) => ctx.model,
      tokens: (ctx) => ctx.tokens,
    });

    expect(failClosed({ model: 'unreleased-model', tokens: 10 })).toBe(250);
  });

  it('rounds a fractional cost up to a whole token', () => {
    const fractional = modelWeightedCost<Ctx>({
      weights: { cheap: 0.5 },
      model: (ctx) => ctx.model,
      tokens: (ctx) => ctx.tokens,
    });

    expect(fractional({ model: 'cheap', tokens: 3 })).toBe(2);
  });

  it('never returns a cost below 1, which RateLimiter would reject', () => {
    expect(cost({ model: 'gpt-4o', tokens: 0 })).toBe(1);
    expect(cost({ model: 'gpt-4o', tokens: -10 })).toBe(1);
    expect(cost({ model: 'gpt-4o', tokens: NaN })).toBe(1);
  });

  it.each([
    ['a non-positive weight', { weights: { 'gpt-4o': 0 } }],
    ['a negative weight', { weights: { 'gpt-4o': -1 } }],
    ['an infinite weight', { weights: { 'gpt-4o': Infinity } }],
  ])('rejects %s', (_label, { weights }) => {
    expect(() =>
      modelWeightedCost<Ctx>({
        weights,
        model: (ctx) => ctx.model,
        tokens: (ctx) => ctx.tokens,
      }),
    ).toThrow(BadArgumentsException);
  });

  it('rejects a non-positive defaultWeight', () => {
    expect(() =>
      modelWeightedCost<Ctx>({
        weights: {},
        defaultWeight: 0,
        model: (ctx) => ctx.model,
        tokens: (ctx) => ctx.tokens,
      }),
    ).toThrow(BadArgumentsException);
  });
});
