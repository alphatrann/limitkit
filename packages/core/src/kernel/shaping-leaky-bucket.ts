import { BadArgumentsException } from "../exceptions";
import { LeakyBucketConfig, RateLimitRuleResult } from "../types";

export type ShapingLeakyBucketState = {
  /** The next timestamp when an item can leave the bucket */
  nextFreeAt: number;
};

/**
 * Pure reducer for the **Shaping Leaky Bucket** (traffic shaping) algorithm.
 *
 * Shared by every store that needs to execute shaping-leaky-bucket logic
 * (`@limitkit/memory`, `@limitkit/postgres`, ...), so behavior stays
 * identical across storage backends.
 *
 * @throws BadArgumentsException if `cost > config.capacity`
 */
export function processShapingLeakyBucket(
  config: LeakyBucketConfig,
  state: ShapingLeakyBucketState | undefined,
  now: number,
  cost: number = 1,
): { state: ShapingLeakyBucketState; output: RateLimitRuleResult } {
  if (cost > config.capacity)
    throw new BadArgumentsException(
      `Cost must never exceed config.capacity, (cost=${cost}, config.capacity=${config.capacity})`,
    );
  if (!state) state = { nextFreeAt: now };
  const { capacity, leakRate } = config;

  let { nextFreeAt } = state;
  if (nextFreeAt < now) nextFreeAt = now;

  const delay = nextFreeAt - now;
  const queueSize = delay * (leakRate / 1000);

  // ----- reject -----
  if (queueSize + cost > capacity) {
    const resetAt = now + (queueSize / leakRate) * 1000;
    return {
      state: { nextFreeAt },
      output: {
        allowed: false,
        limit: capacity,
        remaining: 0,
        resetAt,
        availableAt: nextFreeAt,
      },
    };
  }

  // ----- accept -----
  nextFreeAt += (cost / leakRate) * 1000;

  const resetAt = now + ((queueSize + cost) / leakRate) * 1000;
  const remaining = Math.max(0, Math.floor(capacity - (queueSize + cost)));

  return {
    state: { nextFreeAt },
    output: {
      allowed: true,
      limit: capacity,
      remaining,
      resetAt,
      availableAt: nextFreeAt,
    },
  };
}
