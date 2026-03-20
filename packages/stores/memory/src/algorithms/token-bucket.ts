import {
  BadArgumentsException,
  RateLimitResult,
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
   * Tokens are refilled based on elapsed time before evaluating the request.
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
    if (cost > this.config.capacity)
      throw new BadArgumentsException(
        `Cost must never exceed config.capacity, (cost=${cost}, config.capacity=${this.config.capacity})`,
      );
    if (!state) state = { lastRefill: now, tokens: this.config.capacity };
    const capacity = this.config.capacity;
    const refillRate = this.config.refillRate;

    let { tokens, lastRefill } = state;

    if (lastRefill === null) {
      lastRefill = now;
      tokens = capacity;
    }

    // ----- refill -----
    const elapsedSeconds = (now - lastRefill) / 1000;
    tokens = Math.min(capacity, tokens + elapsedSeconds * refillRate);
    lastRefill = now;

    // ----- reject -----
    if (tokens < cost) {
      const tokensNeeded = cost - tokens;
      const retryAt = now + Math.ceil((tokensNeeded / refillRate) * 1000);
      const resetAt =
        now + Math.ceil(((capacity - tokens) / refillRate) * 1000);

      return {
        state: { tokens, lastRefill },
        output: {
          allowed: false,
          limit: capacity,
          remaining: Math.floor(tokens),
          retryAt,
          resetAt,
        },
      };
    }

    // ----- accept -----
    tokens -= cost;

    const resetAt = now + ((capacity - tokens) / refillRate) * 1000;

    return {
      state: { tokens, lastRefill },
      output: {
        allowed: true,
        limit: capacity,
        remaining: Math.floor(tokens),
        resetAt,
      },
    };
  }
}
