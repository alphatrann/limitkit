import { FixedWindowState, InMemoryCompatible } from '../types';
import {
  FixedWindow,
  processFixedWindow,
  RateLimitRuleResult,
} from '@limitkit/core';

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
   * Delegates to the shared {@link processFixedWindow} reducer in
   * `@limitkit/core`, which is also used by `@limitkit/postgres`.
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
  ): { state: FixedWindowState; output: RateLimitRuleResult } {
    return processFixedWindow(this.config, state, now, cost);
  }
}
