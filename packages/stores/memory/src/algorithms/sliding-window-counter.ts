import {
  processSlidingWindowCounter,
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
   * Delegates to the shared {@link processSlidingWindowCounter} reducer in
   * `@limitkit/core`, which is also used by `@limitkit/postgres`.
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
    return processSlidingWindowCounter(this.config, state, now, cost);
  }
}
