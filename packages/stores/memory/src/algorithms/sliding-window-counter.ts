import {
  BadArgumentsException,
  RateLimitRuleResult,
  SlidingWindowCounter,
} from "@limitkit/core";
import { InMemoryCompatible, SlidingWindowCounterState } from "../types";

/**
 * In-memory implementation of the **Sliding Window Counter** algorithm.
 *
 * This algorithm approximates a sliding window by combining the counts
 * from the current and previous window using linear interpolation.
 *
 * It provides smoother rate limiting than fixed windows while requiring
 * constant memory.
 *
 * ## Characteristics
 * - O(1) state
 * - Smooth transitions between windows
 * - Slight approximation error
 *
 * ## Usage
 * ```ts
 * import { InMemorySlidingWindowCounter } from "@limitkit/memory";
 *
 * const limiter = new InMemorySlidingWindowCounter({
 *   name: "sliding-window-counter",
 *   limit: 100,
 *   window: 60
 * });
 * ```
 *
 * @extends SlidingWindowCounter
 * @implements {InMemoryCompatible<SlidingWindowCounterState>}
 */
export class InMemorySlidingWindowCounter
  extends SlidingWindowCounter
  implements InMemoryCompatible<SlidingWindowCounterState>
{
  /**
   * Processes a request using the sliding window counter algorithm.
   *
   * Calculates the effective request count using a weighted combination
   * of the current and previous window counts.
   *
   * ## Complexity
   * - Time: **O(1)**
   * - Space: **O(1)**
   *
   * @param state Previous algorithm state
   * @param now Current Unix timestamp **in milliseconds**
   * @param cost Number of tokens to consume (default: `1`)
   *
   * @returns Updated state and rate limit result
   *
   * @throws BadArgumentsException if `cost > config.limit`
   */
  process(
    state: SlidingWindowCounterState | undefined,
    now: number,
    cost: number = 1,
  ): { state: SlidingWindowCounterState; output: RateLimitRuleResult } {
    if (cost > this.config.limit)
      throw new BadArgumentsException(
        `Cost must never exceed config.limit, (cost=${cost}, config.limit=${this.config.limit})`,
      );
    if (!state) state = { count: 0, prevCount: 0, windowStart: now };

    const limit = this.config.limit;
    const windowInMs = this.config.window * 1000;
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
      const retryAt = windowStart + windowInMs;
      return {
        state: { windowStart, prevCount, count },
        output: { resetAt, limit, remaining: 0, retryAt, allowed: false },
      };
    }

    count += cost;
    const remaining = Math.max(0, Math.floor(limit - (effective + cost)));
    return {
      state: { count, prevCount, windowStart },
      output: { resetAt, limit, remaining, allowed: true },
    };
  }
}
