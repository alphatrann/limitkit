import { BadArgumentsException } from "../exceptions";
import { RateLimitRuleResult, TokenBucketConfig } from "../types";

export type TokenBucketState = {
  /** Available tokens in the bucket */
  tokens: number;
  /** Timestamp of the last token refill (ms) */
  lastRefill: number;
};

/**
 * Pure reducer for the **Token Bucket** rate limiting algorithm.
 *
 * Shared by every store that needs to execute token-bucket logic
 * (`@limitkit/memory`, `@limitkit/postgres`, ...), so behavior stays
 * identical across storage backends.
 *
 * @throws BadArgumentsException if `cost > config.capacity`
 */
export function processTokenBucket(
  config: TokenBucketConfig,
  state: TokenBucketState | undefined,
  now: number,
  cost: number = 1,
): { state: TokenBucketState; output: RateLimitRuleResult } {
  if (cost > config.capacity)
    throw new BadArgumentsException(
      `Cost must never exceed config.capacity, (cost=${cost}, config.capacity=${config.capacity})`,
    );
  if (!state) state = { lastRefill: now, tokens: config.capacity };
  const capacity = config.capacity;
  const refillRate = config.refillRate;

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
    const availableAt = now + Math.ceil((tokensNeeded / refillRate) * 1000);
    const resetAt =
      now + Math.ceil(((capacity - tokens) / refillRate) * 1000);

    return {
      state: { tokens, lastRefill },
      output: {
        allowed: false,
        limit: capacity,
        remaining: Math.floor(tokens),
        availableAt,
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
