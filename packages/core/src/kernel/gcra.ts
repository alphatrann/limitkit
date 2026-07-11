import { BadArgumentsException } from "../exceptions";
import { GCRAConfig, RateLimitRuleResult } from "../types";

export type GCRAState = {
  /** Theoretical Arrival Time for the next eligible request */
  tat: number;
};

/**
 * Pure reducer for the **GCRA** (Generic Cell Rate Algorithm) rate limiter.
 *
 * Shared by every store that needs to execute GCRA logic
 * (`@limitkit/memory`, `@limitkit/postgres`, ...), so behavior stays
 * identical across storage backends.
 *
 * @throws BadArgumentsException if `cost > config.burst`
 */
export function processGCRA(
  config: GCRAConfig,
  state: GCRAState | undefined,
  now: number,
  cost: number = 1,
): { state: GCRAState; output: RateLimitRuleResult } {
  if (cost > config.burst)
    throw new BadArgumentsException(
      `Cost must never exceed config.burst, (cost=${cost}, config.burst=${config.burst})`,
    );
  if (!state) state = { tat: now };

  const burst = config.burst;
  const interval = config.interval * 1000;

  const burstTolerance = (burst - cost) * interval;

  let { tat } = state;

  if (tat === null) {
    tat = now;
  }

  const allowAt = tat - burstTolerance;

  // ----- reject -----
  if (now < allowAt) {
    return {
      state,
      output: {
        allowed: false,
        remaining: 0,
        availableAt: allowAt,
        limit: burst,
        resetAt: tat,
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
      resetAt: tat,
    },
  };
}
