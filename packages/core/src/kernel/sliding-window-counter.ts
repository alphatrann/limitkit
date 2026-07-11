import { BadArgumentsException } from '../exceptions';
import { RateLimitRuleResult, SlidingWindowCounterConfig } from '../types';

export type SlidingWindowCounterState = {
  /** Request count in the current window */
  count: number;

  /** Request count from the previous window */
  prevCount: number;

  /** Start timestamp of the current window (ms) */
  windowStart: number;
};

/**
 * Pure reducer for the **Sliding Window Counter** rate limiting algorithm.
 *
 * Shared by every store that needs to execute sliding-window-counter logic
 * (`@limitkit/memory`, `@limitkit/postgres`, ...), so behavior stays
 * identical across storage backends.
 *
 * @throws BadArgumentsException if `cost > config.limit`
 */
export function processSlidingWindowCounter(
  config: SlidingWindowCounterConfig,
  state: SlidingWindowCounterState | undefined,
  now: number,
  cost: number = 1,
): { state: SlidingWindowCounterState; output: RateLimitRuleResult } {
  if (cost > config.limit)
    throw new BadArgumentsException(
      `Cost must never exceed config.limit, (cost=${cost}, config.limit=${config.limit})`,
    );
  if (!state) state = { count: 0, prevCount: 0, windowStart: now };

  const limit = config.limit;
  const windowInMs = config.window * 1000;
  let { count, prevCount, windowStart } = state;

  let elapsed = now - windowStart;
  if (elapsed >= windowInMs) {
    const windowsPassed = Math.floor(elapsed / windowInMs);

    prevCount = windowsPassed === 1 ? count : 0;
    count = 0;
    windowStart += windowsPassed * windowInMs;
    elapsed = now - windowStart;
  }

  const progress = elapsed / windowInMs;
  const effective = count + (1 - progress) * prevCount;
  const resetAt = windowStart + 2 * windowInMs;

  if (effective + cost > limit) {
    const availableAt = windowStart + windowInMs;
    return {
      state: { windowStart, prevCount, count },
      output: { resetAt, limit, remaining: 0, availableAt, allowed: false },
    };
  }

  count += cost;
  const remaining = Math.max(0, Math.floor(limit - (effective + cost)));
  return {
    state: { count, prevCount, windowStart },
    output: { resetAt, limit, remaining, allowed: true },
  };
}
