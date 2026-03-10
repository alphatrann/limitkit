import { BadArgumentsException, LeakyBucketConfig } from "@limitkit/core";
import { AlgorithmResult, LeakyBucketState } from "../types";

/**
 * Implementation of leaky bucket (floating token version)
 * Total time complexity: O(1)
 *
 * @param state internal state of leaky bucket algorithm
 * @param config config for leaky bucket algorithm
 * @param now unix timestamp in milliseconds
 * @param cost cost per request
 */
export function leakyBucket(
  state: LeakyBucketState,
  config: LeakyBucketConfig,
  now: number,
  cost: number,
): AlgorithmResult {
  if (config.capacity <= 0)
    throw new BadArgumentsException(
      `Capacity must be a positive integer, got capacity=${config.capacity}`,
    );

  if (config.leakRate <= 0)
    throw new BadArgumentsException(
      `Leak rate must be a positive integer, got leak_rate=${config.leakRate}`,
    );

  const capacity = config.capacity;
  const leakRate = config.leakRate; // requests leaked per second

  let { queueSize, lastLeak } = state;
  if (lastLeak === null) lastLeak = now;

  // ----- leak -----
  const elapsedSeconds = (now - lastLeak) / 1000;
  queueSize = Math.max(0, queueSize - elapsedSeconds * leakRate);
  lastLeak = now;

  // ----- reject -----
  if (queueSize + cost > capacity) {
    const overflow = queueSize + cost - capacity;
    const retryMs = (overflow / leakRate) * 1000;

    const retryAfter = Math.max(0, Math.ceil(retryMs / 1000));
    const reset = now + (queueSize / leakRate) * 1000;
    return {
      state: { lastLeak, queueSize },
      output: { allowed: false, remaining: 0, reset, retryAfter },
    };
  }

  // ----- accept -----
  queueSize += cost;

  const reset = now + (queueSize / leakRate) * 1000;
  const remaining = Math.max(0, capacity - Math.floor(queueSize));

  return {
    state: { queueSize, lastLeak },
    output: {
      allowed: true,
      remaining,
      reset,
    },
  };
}
