import { BadArgumentsException, GCRA, RateLimitResult } from "@limitkit/core";
import { GCRAState, InMemoryCompatible } from "../types";

/**
 * In-memory implementation of the GCRA
 *
 * Usage:
 * ```ts
 * const inMemoryGCRA = new InMemoryGCRA({ name: "gcra", interval: 1, burst: 5 })
 * ```
 */
export class InMemoryGCRA
  extends GCRA
  implements InMemoryCompatible<GCRAState>
{
  /**
   * Computes the next GCRA state based on the configuration and given parameters
   * * Total time complexity: O(1)
   * * Total space complexity: O(1)
   *
   * @param state Internal state of GCRA
   * @param now Current Unix timestamp in millisecond
   * @param cost Optional cost/weight of each request. Defaults to 1 if not specified. Must never exceed `this.config.capacity`
   * @returns The next state and rate limit result
   * @see LeakyBucketState
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
