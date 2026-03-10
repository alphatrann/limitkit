import { BadArgumentsException, TokenBucketConfig } from "@limitkit/core";
import { TokenBucketState, AlgorithmResult } from "../types";

/**
 * Implementation of token bucket
 * Total time complexity: O(1)
 *
 * @param state internal state of token bucket algorithm
 * @param config config for token bucket algorithm
 * @param now unix timestamp in milliseconds
 * @param cost cost per request
 */
export function tokenBucket(
  state: TokenBucketState,
  config: TokenBucketConfig,
  now: number,
  cost: number,
): AlgorithmResult {
  if (config.capacity <= 0)
    throw new BadArgumentsException(
      `Capacity must be a positive integer, got capacity=${config.capacity}`,
    );

  if (config.refillRate <= 0)
    throw new BadArgumentsException(
      `Refill rate must be a positive integer, got refill_rate=${config.refillRate}`,
    );

  if (config.initialTokens && config.initialTokens <= 0)
    throw new BadArgumentsException(
      `Initial tokens must be a positive integer, got initial_tokens=${config.initialTokens}`,
    );

  const capacity = config.capacity;
  const refillRate = config.refillRate; // tokens per second
  const initialTokens = config.initialTokens ?? capacity;

  let { tokens, lastRefill } = state;

  if (lastRefill === null) {
    tokens = initialTokens;
    lastRefill = now;
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
      remaining: Math.floor(tokens),
      reset,
    },
  };
}
