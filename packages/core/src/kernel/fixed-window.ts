import { BadArgumentsException } from "../exceptions";
import { FixedWindowConfig, RateLimitRuleResult } from "../types";

export type FixedWindowState = {
  /** Number of requests in the current window */
  count: number;
  /** Timestamp when the current window started */
  windowStart: number;
};

/**
 * Pure reducer for the **Fixed Window** rate limiting algorithm.
 *
 * Shared by every store that needs to execute fixed-window logic
 * (`@limitkit/memory`, `@limitkit/postgres`, ...), so behavior stays
 * identical across storage backends.
 *
 * @throws BadArgumentsException if `cost > config.limit`
 */
export function processFixedWindow(
  config: FixedWindowConfig,
  state: FixedWindowState | undefined,
  now: number,
  cost: number = 1,
): { state: FixedWindowState; output: RateLimitRuleResult } {
  if (cost > config.limit)
    throw new BadArgumentsException(
      `Cost must never exceed config.limit, (cost=${cost}, config.limit=${config.limit})`,
    );
  const windowInMs = config.window * 1000;
  if (!state) state = { windowStart: now - (now % windowInMs), count: 0 };

  const isStillInCurrentWindow = now - state.windowStart < windowInMs;

  const hasExceededLimit = state.count + cost > config.limit;
  if (isStillInCurrentWindow && hasExceededLimit) {
    const resetAt = state.windowStart + windowInMs;
    return {
      state,
      output: {
        allowed: false,
        remaining: 0,
        limit: config.limit,
        resetAt,
        availableAt: resetAt,
      },
    };
  }
  const newState = { ...state };
  if (!isStillInCurrentWindow) {
    newState.windowStart = now - (now % windowInMs);
    newState.count = 0;
  }
  const resetAt = newState.windowStart + windowInMs;
  newState.count += cost;
  const remaining = config.limit - newState.count;
  return {
    state: newState,
    output: { allowed: true, limit: config.limit, remaining, resetAt },
  };
}
