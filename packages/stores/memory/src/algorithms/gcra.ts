import { BadArgumentsException, GCRA, RateLimitResult } from "@limitkit/core";
import { GCRAState, InMemoryCompatible } from "../types";

export class InMemoryGCRA
  extends GCRA
  implements InMemoryCompatible<GCRAState>
{
  /**
   * In-memory implementation of GCRA
   * Total time complexity: O(1)
   *
   * @param state internal state of GCRA
   * @param now unix timestamp in milliseconds
   * @param cost cost per request (must be less than or equal to burst)
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
