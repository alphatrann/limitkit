import {
  LeakyBucket,
  processLeakyBucket,
  RateLimitRuleResult,
} from '@limitkit/core';
import { InMemoryCompatible, LeakyBucketState } from '../types';

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
   * Delegates to the shared {@link processLeakyBucket} reducer in
   * `@limitkit/core`, which is also used by `@limitkit/postgres`.
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
    return processLeakyBucket(this.config, state, now, cost);
  }
}
