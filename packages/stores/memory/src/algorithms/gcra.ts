import { BadArgumentsException, GCRAConfig } from "@limitkit/core";
import { AlgorithmResult, GCRAState } from "../types";

/**
 * Implementation of GCRA
 * Total time complexity: O(1)
 *
 * @param state internal state of GCRA
 * @param config config for GCRA
 * @param now unix timestamp in milliseconds
 * @param cost cost per request (must be less than or equal to burst)
 */
export function gcra(
  state: GCRAState,
  config: GCRAConfig,
  now: number,
  cost: number = 1,
): AlgorithmResult {
  if (config.burst <= 0)
    throw new BadArgumentsException(
      `Burst must be a positive integer, got burst=${config.burst}`,
    );

  if (config.interval <= 0)
    throw new BadArgumentsException(
      `Interval must be a positive integer, got interval=${config.interval}`,
    );

  if (cost > config.burst)
    throw new BadArgumentsException(
      `Cost must never exceed burst, got burst=${config.interval}, cost=${cost}`,
    );

  const burst = config.burst;
  const interval = config.interval * 1000;

  const burstTolerance = (burst - 1) * interval;

  let { tat } = state;

  if (tat === null) {
    tat = now;
  }

  const allowAt = tat - burstTolerance;

  // ----- reject -----
  if (now < allowAt) {
    const retryAfter = Math.max(0, Math.ceil((allowAt - now) / 1000));

    return {
      state,
      output: {
        allowed: false,
        remaining: 0,
        retryAfter,
        reset: tat,
      },
    };
  }

  // ----- accept -----
  tat = Math.max(now, tat) + cost * interval;

  const backlog = tat - now;
  const remaining = Math.max(
    0,
    Math.floor((burstTolerance - backlog) / interval),
  );

  return {
    state: { tat },
    output: {
      allowed: true,
      remaining,
      reset: tat,
    },
  };
}
