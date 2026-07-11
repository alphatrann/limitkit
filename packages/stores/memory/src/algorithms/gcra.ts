import { GCRA, processGCRA, RateLimitRuleResult } from "@limitkit/core";
import { GCRAState, InMemoryCompatible } from "../types";

/**
 * In-memory implementation of the **GCRA (Generic Cell Rate Algorithm)**.
 *
 * GCRA enforces rate limits using the concept of a **Theoretical Arrival Time (TAT)**.
 * Each accepted request moves the TAT forward, ensuring that future requests
 * respect the configured rate.
 *
 * This algorithm provides strict rate guarantees and is widely used in
 * network traffic shaping and API gateways.
 *
 * ## Characteristics
 * - Precise rate enforcement
 * - Supports bursts via `burst` configuration
 * - Constant memory usage
 *
 * ## Usage
 * ```ts
 * import { InMemoryGCRA } from "@limitkit/memory";
 *
 * const limiter = new InMemoryGCRA({
 *   name: "gcra",
 *   interval: 1,
 *   burst: 5
 * });
 * ```
 *
 * @extends GCRA
 * @implements {InMemoryCompatible<GCRAState>}
 */
export class InMemoryGCRA
  extends GCRA
  implements InMemoryCompatible<GCRAState>
{
  /**
   * Processes a request using the GCRA algorithm.
   *
   * Delegates to the shared {@link processGCRA} reducer in
   * `@limitkit/core`, which is also used by `@limitkit/postgres`.
   *
   * ## Complexity
   * - Time: **O(1)**
   * - Space: **O(1)**
   *
   * @param state Previous GCRA state
   * @param now Current Unix timestamp **in milliseconds**
   * @param cost Number of tokens to consume
   *
   * @returns Updated state and rate limit result
   *
   * @throws BadArgumentsException if `cost > config.burst`
   */
  process(
    state: GCRAState | undefined,
    now: number,
    cost: number = 1,
  ): { state: GCRAState; output: RateLimitRuleResult } {
    return processGCRA(this.config, state, now, cost);
  }
}
