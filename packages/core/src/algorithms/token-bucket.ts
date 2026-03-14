import { BadArgumentsException } from "../exceptions";
import { Algorithm, TokenBucketConfig } from "../types";

/**
 * Base implementation of the **Token Bucket** rate limiting algorithm.
 *
 * This class provides the **shared configuration and validation logic**
 * for token bucket rate limiting but does **not perform rate limiting itself**.
 *
 * Concrete implementations must extend this class and provide the execution
 * logic for a specific storage backend (e.g. Redis, in-memory, database).
 *
 * ## Purpose
 * Separating algorithm configuration from storage execution allows the same
 * algorithm definition to be reused across multiple stores.
 *
 * For example:
 *
 * - `InMemoryTokenBucket` — executes the algorithm using in-memory state
 * - `RedisTokenBucket` — executes the algorithm using Redis + Lua scripts
 *
 * ## Usage
 * End users typically **do not use this class directly**. Instead they should
 * use a store-specific implementation:
 *
 * ```ts
 * import { InMemoryTokenBucket } from "@limitkit/memory";
 *
 * const limiter = new InMemoryTokenBucket({
 *   name: "token-bucket",
 *   capacity: 100,
 *   refillRate: 5
 * });
 * ```
 *
 * @abstract
 * @implements {Algorithm<TokenBucketConfig>}
 */
export abstract class TokenBucket implements Algorithm<TokenBucketConfig> {
  constructor(public readonly config: TokenBucketConfig) {}

  /**
   * Validates the token bucket configuration.
   *
   * Ensures the configured capacity and refill rate are positive values.
   *
   * @throws BadArgumentsException
   * Thrown if:
   * - `capacity <= 0`
   * - `refillRate <= 0`
   */
  validate(): void {
    if (this.config.capacity <= 0)
      throw new BadArgumentsException(
        `Expected capacity to be positive, got capacity=${this.config.capacity}`,
      );
    if (this.config.refillRate <= 0)
      throw new BadArgumentsException(
        `Expected refillRate to be positive, got refillRate=${this.config.refillRate}`,
      );
  }
}
