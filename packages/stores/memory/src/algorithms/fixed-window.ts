import { FixedWindowState, InMemoryCompatible } from "../types";
import {
  BadArgumentsException,
  FixedWindow,
  RateLimitResult,
} from "@limitkit/core";

/**
 * In-memory implementation of the **Fixed Window** rate limiting algorithm.
 *
 * The fixed window algorithm divides time into discrete windows and counts
 * the number of requests within the current window. When the window resets,
 * the counter is cleared.
 *
 * This implementation stores the window start timestamp and request count
 * in memory for each key.
 *
 * ## Characteristics
 * - Simple and fast
 * - O(1) state
 * - Allows bursts at window boundaries
 *
 * ## Usage
 * ```ts
 * import { InMemoryFixedWindow } from "@limitkit/memory";
 *
 * const limiter = new InMemoryFixedWindow({
 *   name: "fixed-window",
 *   limit: 100,
 *   window: 60
 * });
 * ```
 *
 * @extends FixedWindow
 * @implements {InMemoryCompatible<FixedWindowState>}
 */
export class InMemoryFixedWindow
  extends FixedWindow
  implements InMemoryCompatible<FixedWindowState>
{
  /**
   * Processes a request and updates the fixed window state.
   *
   * Determines whether the request can be allowed based on the number of
   * requests already consumed in the current window.
   *
   * ## Complexity
   * - Time: **O(1)**
   * - Space: **O(1)**
   *
   * @param state Previous algorithm state for the identifier
   * @param now Current Unix timestamp **in milliseconds**
   * @param cost Number of tokens to consume (default: `1`)
   *
   * @returns Updated state and rate limit decision
   *
   * @throws BadArgumentsException if `cost > config.limit`
   */
  process(
    state: FixedWindowState | undefined,
    now: number,
    cost: number = 1,
  ): { state: FixedWindowState; output: RateLimitResult } {
    if (cost > this.config.limit)
      throw new BadArgumentsException(
        `Cost must never exceed config.limit, (cost=${cost}, config.limit=${this.config.limit})`,
      );
    const windowInMs = this.config.window * 1000;
    if (!state) state = { windowStart: now - (now % windowInMs), count: 0 };

    const isStillInCurrentWindow = now - state.windowStart < windowInMs;

    const hasExceededLimit = state.count + cost > this.config.limit;
    if (isStillInCurrentWindow && hasExceededLimit) {
      const reset = state.windowStart + windowInMs;
      const retryAfter = Math.max(0, Math.ceil((reset - now) / 1000));
      return {
        state,
        output: {
          allowed: false,
          remaining: 0,
          limit: this.config.limit,
          reset,
          retryAfter,
        },
      };
    }
    const newState = { ...state };
    if (!isStillInCurrentWindow) {
      newState.windowStart = now - (now % windowInMs);
      newState.count = 0;
    }
    const reset = newState.windowStart + windowInMs;
    newState.count += cost;
    const remaining = this.config.limit - newState.count;
    return {
      state: newState,
      output: { allowed: true, limit: this.config.limit, remaining, reset },
    };
  }
}
