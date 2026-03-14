import { BadArgumentsException, GCRA, RateLimitResult } from "@limitkit/core";
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
   * Calculates whether the request arrives before the allowed
   * theoretical arrival time (TAT).
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
    cost: number,
  ): { state: GCRAState; output: RateLimitResult } {
    if (cost > this.config.burst)
      throw new BadArgumentsException(
        `Cost must never exceed config.burst, (cost=${cost}, config.burst=${this.config.burst})`,
      );
    if (!state) state = { tat: now };

    const burst = this.config.burst;
    const interval = this.config.interval * 1000;

    const burstTolerance = (burst - 1) * interval;

    let { tat } = state;

    if (tat === null) {
      tat = now;
    }

    const allowAt = tat - burstTolerance + (cost - 1) * interval;

    // ----- reject -----
    if (now < allowAt) {
      const retryAfter = Math.max(0, Math.ceil((allowAt - now) / 1000));

      return {
        state,
        output: {
          allowed: false,
          remaining: 0,
          retryAfter,
          limit: burst,
          reset: tat,
        },
      };
    }

    // ----- accept -----
    tat = Math.max(now, tat) + cost * interval;

    const backlog = tat - now;
    const remaining = Math.max(
      0,
      Math.floor((burstTolerance - backlog) / interval) + 1,
    );

    return {
      state: { tat },
      output: {
        allowed: true,
        remaining,
        limit: burst,
        reset: tat,
      },
    };
  }
}
