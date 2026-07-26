import { BadArgumentsException, TokenBucketConfig } from '@limitkit/core';

/**
 * A token bucket configuration, minus the `name` discriminator that the store
 * factories supply. This is exactly the argument
 * `tokenBucket()` takes in `@limitkit/memory`, `@limitkit/redis`, and
 * `@limitkit/postgres`, so a budget can be handed to any store:
 *
 * ```ts
 * import { tokenBucket } from '@limitkit/redis';
 * import { monthlyTokenBudget } from '@limitkit/ai';
 *
 * policy: tokenBucket(monthlyTokenBudget({ tokens: 1_000_000 }))
 * ```
 */
export type TokenBudgetPolicy = Omit<TokenBucketConfig, 'name'>;

const SECONDS_PER_DAY = 86_400;

/** Period lengths, in seconds, used by the named budget presets. */
export const TOKEN_BUDGET_PERIODS = {
  /** 7 days. */
  week: 7 * SECONDS_PER_DAY,
  /** 30 days — a billing month, not a calendar month. */
  month: 30 * SECONDS_PER_DAY,
  /** 1 hour. */
  session: 3_600,
} as const;

/**
 * A budget of tokens granted over some period.
 */
export interface TokenBudgetOptions {
  /**
   * Tokens granted per period. This sets the long-run spend rate.
   */
  tokens: number;

  /**
   * Most tokens spendable in one burst, before refill. Defaults to `tokens`,
   * which lets a user spend the whole period's budget up front and then earn it
   * back continuously.
   *
   * Lowering it smooths spending: the bucket still refills at `tokens` per
   * period, but never holds more than `burst`. Note this is a ceiling on the
   * bucket, not on the period — a user who spends steadily can still draw
   * roughly `burst + tokens` over a full period.
   *
   * A single request may never cost more than `burst`; the token bucket rejects
   * a cost above its capacity outright.
   */
  burst?: number;
}

/**
 * A token budget over an explicit period.
 */
export interface PeriodicTokenBudgetOptions extends TokenBudgetOptions {
  /** Length of the period, in seconds. */
  period: number;
}

/**
 * Length of a session, when it differs from the default hour.
 */
export interface SessionTokenBudgetOptions extends TokenBudgetOptions {
  /**
   * Length of a session, in seconds. Defaults to `3600` (one hour).
   */
  duration?: number;
}

/**
 * Build a token-bucket policy config from a token budget over a period.
 *
 * This is the primitive the named presets are built on. Reach for it directly
 * when your period isn't a week, a month, or a session — a daily budget, say:
 *
 * ```ts
 * policy: tokenBucket(tokenBudget({ tokens: 50_000, period: 86_400 }))
 * ```
 *
 * @throws BadArgumentsException if `tokens`, `period`, or `burst` is not a
 * positive, finite number.
 */
export function tokenBudget({
  tokens,
  period,
  burst,
}: PeriodicTokenBudgetOptions): TokenBudgetPolicy {
  if (!Number.isFinite(tokens) || tokens <= 0)
    throw new BadArgumentsException(
      `Expected tokens to be positive, got tokens=${tokens}`,
    );
  if (!Number.isFinite(period) || period <= 0)
    throw new BadArgumentsException(
      `Expected period to be positive, got period=${period}`,
    );
  if (burst !== undefined && (!Number.isFinite(burst) || burst <= 0))
    throw new BadArgumentsException(
      `Expected burst to be positive, got burst=${burst}`,
    );

  return {
    capacity: burst ?? tokens,
    // `refillRate` is tokens per second, so a budget stated per period has to
    // be divided down. Doing this by hand is the easiest thing to get wrong:
    // 1M tokens/month is ~0.386 tokens/second, not 33,333.
    refillRate: tokens / period,
  };
}

/**
 * A monthly token budget — `tokens` spendable per 30-day period.
 *
 * The usual shape for a per-user LLM quota on a subscription plan.
 *
 * @example
 * ```ts
 * import { tokenBucket } from '@limitkit/postgres';
 * import { monthlyTokenBudget } from '@limitkit/ai';
 *
 * {
 *   name: 'monthly-tokens',
 *   key: (ctx) => 'acc:' + ctx.userId,
 *   cost: (ctx) => ctx.usage.totalTokens,
 *   policy: tokenBucket(monthlyTokenBudget({ tokens: 1_000_000 })),
 * }
 * ```
 *
 * @throws BadArgumentsException if `tokens` or `burst` is not a positive,
 * finite number.
 */
export function monthlyTokenBudget(
  options: TokenBudgetOptions,
): TokenBudgetPolicy {
  return tokenBudget({ ...options, period: TOKEN_BUDGET_PERIODS.month });
}

/**
 * A weekly token budget — `tokens` spendable per 7-day period.
 *
 * @throws BadArgumentsException if `tokens` or `burst` is not a positive,
 * finite number.
 */
export function weeklyTokenBudget(
  options: TokenBudgetOptions,
): TokenBudgetPolicy {
  return tokenBudget({ ...options, period: TOKEN_BUDGET_PERIODS.week });
}

/**
 * A per-session token budget — `tokens` spendable per `duration` (default one
 * hour).
 *
 * Key it by conversation or session id rather than user id, so each session
 * gets its own bucket:
 *
 * ```ts
 * {
 *   name: 'session-tokens',
 *   key: (ctx) => 'session:' + ctx.sessionId,
 *   cost: (ctx) => ctx.usage.totalTokens,
 *   policy: tokenBucket(sessionTokenBudget({ tokens: 100_000 })),
 * }
 * ```
 *
 * @throws BadArgumentsException if `tokens`, `duration`, or `burst` is not a
 * positive, finite number.
 */
export function sessionTokenBudget({
  duration = TOKEN_BUDGET_PERIODS.session,
  ...options
}: SessionTokenBudgetOptions): TokenBudgetPolicy {
  return tokenBudget({ ...options, period: duration });
}
