import { BadArgumentsException } from '@limitkit/core';

/**
 * How to weight a request's tokens by the model that served it.
 *
 * @template C The rate limiter's context type.
 */
export interface ModelWeightedCostOptions<C> {
  /**
   * Cost multiplier per model name.
   *
   * The numbers are yours to choose. The natural basis is relative price: if a
   * frontier model costs 20x what your small model costs, weight it 20 and
   * charge every plan from one budget. Weights are relative, so only their
   * ratios matter.
   *
   * @example
   * ```ts
   * weights: {
   *   'claude-opus-4-8': 25,
   *   'claude-haiku-4-5': 5,
   *   'gpt-4o-mini': 1,
   * }
   * ```
   */
  weights: Record<string, number>;

  /**
   * Multiplier for a model absent from `weights`. Defaults to `1`.
   *
   * Set it high to fail closed: an unrecognized model — a newly released one,
   * or one a client picked that you didn't plan for — is then charged at a
   * premium rather than slipping through cheaply.
   */
  defaultWeight?: number;

  /** Which model served the request. */
  model: (ctx: C) => string;

  /** How many tokens the request used, e.g. `(ctx) => ctx.usage.totalTokens`. */
  tokens: (ctx: C) => number;
}

/**
 * Build a rule `cost` resolver that charges tokens weighted by model tier.
 *
 * Charging raw token counts treats every model's tokens as equal, but they are
 * not: a frontier model's tokens can cost an order of magnitude more than a
 * small model's. Weighting lets one budget govern spend across a whole model
 * lineup, so a user can burn their quota on a lot of cheap calls or a few
 * expensive ones.
 *
 * The returned resolver drops straight into a rule's `cost` field.
 *
 * @example
 * ```ts
 * import { tokenBucket } from '@limitkit/redis';
 * import { modelWeightedCost, monthlyTokenBudget } from '@limitkit/ai';
 *
 * {
 *   name: 'monthly-tokens',
 *   key: (ctx) => 'acc:' + ctx.userId,
 *   cost: modelWeightedCost<ChatContext>({
 *     weights: { 'gpt-4o': 10, 'gpt-4o-mini': 1 },
 *     defaultWeight: 10,
 *     model: (ctx) => ctx.model,
 *     tokens: (ctx) => ctx.usage.totalTokens,
 *   }),
 *   policy: tokenBucket(monthlyTokenBudget({ tokens: 1_000_000 })),
 * }
 * ```
 *
 * @throws BadArgumentsException if any weight, or `defaultWeight`, is not a
 * positive finite number.
 * @returns A resolver usable as a `LimitRule`'s `cost`. It always returns at
 * least `1`.
 */
export function modelWeightedCost<C = unknown>({
  weights,
  defaultWeight = 1,
  model,
  tokens,
}: ModelWeightedCostOptions<C>): (ctx: C) => number {
  for (const [name, weight] of Object.entries(weights)) {
    if (!Number.isFinite(weight) || weight <= 0)
      throw new BadArgumentsException(
        `Expected weight for "${name}" to be positive, got weight=${weight}`,
      );
  }
  if (!Number.isFinite(defaultWeight) || defaultWeight <= 0)
    throw new BadArgumentsException(
      `Expected defaultWeight to be positive, got defaultWeight=${defaultWeight}`,
    );

  return (ctx: C): number => {
    const weight = weights[model(ctx)] ?? defaultWeight;
    const used = tokens(ctx);
    const cost = Number.isFinite(used) && used > 0 ? used * weight : 0;

    // RateLimiter rejects a cost of 0 or less, so every request costs at least
    // one token even when the provider reported no usage.
    return Math.max(1, Math.ceil(cost));
  };
}
