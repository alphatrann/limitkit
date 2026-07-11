import { BadArgumentsException } from '../exceptions';
import { LeakyBucketConfig, RateLimitRuleResult } from '../types';

export type LeakyBucketState = {
  /** Number of requests currently in the queue */
  queueSize: number;
  /** Timestamp of the last leak event (ms) */
  lastLeak: number;
};

/**
 * Pure reducer for the **Leaky Bucket** rate limiting algorithm.
 *
 * Shared by every store that needs to execute leaky-bucket logic
 * (`@limitkit/memory`, `@limitkit/postgres`, ...), so behavior stays
 * identical across storage backends.
 *
 * @throws BadArgumentsException if `cost > config.capacity`
 */
export function processLeakyBucket(
  config: LeakyBucketConfig,
  state: LeakyBucketState | undefined,
  now: number,
  cost: number = 1,
): { state: LeakyBucketState; output: RateLimitRuleResult } {
  if (cost > config.capacity)
    throw new BadArgumentsException(
      `Cost must never exceed config.capacity, (cost=${cost}, config.capacity=${config.capacity})`,
    );
  if (!state) state = { queueSize: 0, lastLeak: now };
  const capacity = config.capacity;
  const leakRate = config.leakRate;

  let { queueSize, lastLeak } = state;
  if (lastLeak === null) lastLeak = now;

  // ----- leak -----
  const elapsedSeconds = (now - lastLeak) / 1000;
  queueSize = Math.max(0, queueSize - elapsedSeconds * leakRate);
  lastLeak = now;

  // ----- reject -----
  if (queueSize + cost > capacity) {
    const overflow = queueSize + cost - capacity;
    const availableAt = now + (overflow / leakRate) * 1000;
    const resetAt = now + (queueSize / leakRate) * 1000;
    return {
      state: { lastLeak, queueSize },
      output: {
        allowed: false,
        limit: capacity,
        remaining: 0,
        resetAt,
        availableAt,
      },
    };
  }

  // ----- accept -----
  queueSize += cost;

  const resetAt = now + (queueSize / leakRate) * 1000;
  const remaining = Math.max(0, Math.floor(capacity - queueSize));

  return {
    state: { queueSize, lastLeak },
    output: {
      allowed: true,
      limit: capacity,
      remaining,
      resetAt,
    },
  };
}
