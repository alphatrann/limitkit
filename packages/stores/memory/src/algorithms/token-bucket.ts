import {
  processTokenBucket,
  RateLimitRuleResult,
  TokenBucket,
} from "@limitkit/core";
import { InMemoryCompatible, TokenBucketState } from "../types";

/**
 * In-memory implementation of the **Token Bucket** rate limiting algorithm.
 *
 * The bucket refills tokens continuously over time at a configured rate.
 * Each request consumes tokens from the bucket.
 *
 * Requests are allowed if sufficient tokens are available.
 *
 * ## Characteristics
 * - Allows burst traffic
 * - Smooth rate limiting
 * - Continuous token refill
 *
 * ## Usage
 * ```ts
 * import { InMemoryTokenBucket } from "@limitkit/memory";
 *
 * const limiter = new InMemoryTokenBucket({
 *   name: "token-bucket",
 *   capacity: 100,
 *   refillRate: 2
 * });
 * ```
 *
 * @extends TokenBucket
 * @implements {InMemoryCompatible<TokenBucketState>}
 */
export class InMemoryTokenBucket
  extends TokenBucket
  implements InMemoryCompatible<TokenBucketState>
{
  /**
   * Processes a request using the token bucket algorithm.
   *
   * Delegates to the shared {@link processTokenBucket} reducer in
   * `@limitkit/core`, which is also used by `@limitkit/postgres`.
   *
   * ## Complexity
   * - Time: **O(1)**
   * - Space: **O(1)**
   *
   * @param state Previous token bucket state
   * @param now Current Unix timestamp **in milliseconds**
   * @param cost Number of tokens to consume (default: `1`)
   *
   * @returns Updated state and rate limit result
   *
   * @throws BadArgumentsException if `cost > config.capacity`
   */
  process(
    state: TokenBucketState | undefined,
    now: number,
    cost: number = 1,
  ): { state: TokenBucketState; output: RateLimitRuleResult } {
    return processTokenBucket(this.config, state, now, cost);
  }
}
