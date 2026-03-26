import {
  BadArgumentsException,
  LeakyBucket,
  RateLimitRuleResult,
} from "@limitkit/core";
import { InMemoryCompatible, LeakyBucketState } from "../types";

/**
 * In-memory implementation of the **Policing Leaky Bucket** rate limiting algorithm.
 *
 * Requests enter a queue (the bucket) and leak out at a constant rate.
 * If the bucket overflows, new requests are rejected.
 *
 * The implementation is simply a mathematical inverse to that of token bucket.
 *
 * ## Characteristics
 * - Smooth request rate
 * - Predictable output rate
 * - Queue-based model
 *
 * ## Usage
 * ```ts
 * import { InMemoryLeakyBucket } from "@limitkit/memory";
 *
 * const limiter = new InMemoryLeakyBucket({
 *   name: "leaky-bucket",
 *   capacity: 100,
 *   leakRate: 2
 * });
 * ```
 *
 *
 * @extends LeakyBucket
 * @implements {InMemoryCompatible<LeakyBucketState>}
 */
export class InMemoryLeakyBucket
  extends LeakyBucket
  implements InMemoryCompatible<LeakyBucketState>
{
  /**
   * Processes a request using the leaky bucket algorithm.
   *
   * The bucket leaks requests over time based on the configured leak rate.
   *
   * ## Complexity
   * - Time: **O(1)**
   * - Space: **O(1)**
   *
   * @param state Previous leaky bucket state
   * @param now Current Unix timestamp **in milliseconds**
   * @param cost Number of tokens to consume (default: `1`)
   *
   * @returns Updated state and rate limit result
   *
   * @throws BadArgumentsException if `cost > config.capacity`
   */
  process(
    state: LeakyBucketState | undefined,
    now: number,
    cost: number = 1,
  ): { state: LeakyBucketState; output: RateLimitRuleResult } {
    if (cost > this.config.capacity)
      throw new BadArgumentsException(
        `Cost must never exceed config.capacity, (cost=${cost}, config.capacity=${this.config.capacity})`,
      );
    if (!state) state = { queueSize: 0, lastLeak: now };
    const capacity = this.config.capacity;
    const leakRate = this.config.leakRate;

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
}
