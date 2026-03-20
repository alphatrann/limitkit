import { Algorithm } from "./algorithm";
import { AlgorithmConfig } from "./algorithm-config";
import { RateLimitRuleResult } from "./rate-limit-result";

/**
 * Interface for a storage backend that tracks rate limiting state.
 *
 * Implementations can use various backends (in-memory, Redis, DynamoDB, etc.)
 * to persist the request counts and windows needed by rate limiting algorithms.
 */
export interface Store {
  /**
   * Process a request and update the stored rate limit state for the given key.
   *
   * Atomically updates the counter for the given key based on the specified algorithm
   * and returns the result (whether the request is allowed and when the limit resets).
   * @template TConfig - Algorithm-dependent configuration schema
   * @param key - The rate limiting key that identifies what entity is being limited
   *              (e.g., "user-123", "ip-192.168.1.1"). Requests with the same key
   *              share the same rate limit quota.
   * @param algorithm - The rate limiting algorithm configuration to apply.
   * @param now - Unix timestamp in millisecond
   * @param cost - The cost/weight of this request. Defaults to 1. Higher costs consume
   *               more quota (useful for charging different amounts for different operations).
   * @returns A promise that resolves to the rate limit check result for a particular rule.
   */
  consume<TConfig extends AlgorithmConfig>(
    key: string,
    algorithm: Algorithm<TConfig>,
    now: number,
    cost?: number,
  ): Promise<RateLimitRuleResult>;
}
