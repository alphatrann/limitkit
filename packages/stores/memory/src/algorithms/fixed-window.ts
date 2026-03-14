import { FixedWindowState, InMemoryCompatible } from "../types";
import {
  BadArgumentsException,
  FixedWindow,
  RateLimitResult,
} from "@limitkit/core";

/**
 * In-memory implementation of the fixed window algorithm
 *
 * Usage:
 * ```ts
 * const inMemoryFixedWindow = new InMemoryFixedWindow({ name: "fixed-window", limit: 100, window: 60 })
 * ```
 */
export class InMemoryFixedWindow
  extends FixedWindow
  implements InMemoryCompatible<FixedWindowState>
{
  /**
   * Computes the next fixed window state based on the configuration and given parameters
   * * Total time complexity: O(1)
   * * Total space complexity: O(1)
   *
   * @param state Internal state of sliding window algorithm
   * @param now Current Unix timestamp in millisecond
   * @param cost Optional cost/weight of each request. Defaults to 1 if not specified. Must never exceed `this.config.limit`
   * @returns The next state and rate limit result
   * @see FixedWindowState
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
