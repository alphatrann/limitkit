import {
  BadArgumentsException,
  RateLimitResult,
  TokenBucket,
} from "@limitkit/core";
import { InMemoryCompatible, TokenBucketState } from "../types";

/**
 * In-memory implementation of the token bucket algorithm
 *
 * Usage:
 * ```ts
 * const inMemoryTokenBucket = new InMemoryTokenBucket({ name: "token-bucket", capacity: 100, refillRate: 2 })
 * ```
 */
export class InMemoryTokenBucket
  extends TokenBucket
  implements InMemoryCompatible<TokenBucketState>
{
  /**
   * Computes the next token bucket state based on the configuration and given parameters
   * * Total time complexity: O(1)
   * * Total space complexity: O(1)
   *
   * @param state Internal state of token bucket algorithm
   * @param now Current Unix timestamp in millisecond
   * @param cost Optional cost/weight of each request. Defaults to 1 if not specified. Must never exceed `this.config.capacity`
   * @returns The next state and rate limit result
   * @see TokenBucketState
   */
  process(
    state: TokenBucketState | undefined,
    now: number,
    cost: number = 1,
  ): { state: TokenBucketState; output: RateLimitResult } {
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
      const retryMs = (tokensNeeded / refillRate) * 1000;

      const retryAfter = Math.max(0, Math.ceil(retryMs / 1000));
      const reset = now + ((capacity - tokens) / refillRate) * 1000;

      return {
        state: { tokens, lastRefill },
        output: {
          allowed: false,
          limit: capacity,
          remaining: Math.floor(tokens),
          retryAfter,
          reset,
        },
      };
    }

    // ----- accept -----
    tokens -= cost;

    const reset = now + ((capacity - tokens) / refillRate) * 1000;

    return {
      state: { tokens, lastRefill },
      output: {
        allowed: true,
        limit: capacity,
        remaining: Math.floor(tokens),
        reset,
      },
    };
  }
}
