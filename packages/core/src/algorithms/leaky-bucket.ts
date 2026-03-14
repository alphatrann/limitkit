import { BadArgumentsException } from "../exceptions";
import { Algorithm, LeakyBucketConfig } from "../types";

/**
 * Base implementation of the **Leaky Bucket** rate limiting algorithm.
 *
 * This class provides the **shared configuration and validation logic**
 * for leaky bucket rate limiting but does **not perform rate limiting itself**.
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
 * - `InMemoryLeakyBucket` — executes the algorithm using in-memory state
 * - `RedisLeakyBucket` — executes the algorithm using Redis + Lua scripts
 *
 * ## Usage
 * End users typically **do not use this class directly**. Instead they should
 * use a store-specific implementation:
 *
 * ```ts
 * import { InMemoryLeakyBucket } from "@limitkit/memory";
 *
 * const limiter = new InMemoryLeakyBucket({
 *   name: "leaky-bucket",
 *   capacity: 100,
 *   leakRate: 5
 * });
 * ```
 *
 * @abstract
 * @implements {Algorithm<LeakyBucketConfig>}
 */
export abstract class LeakyBucket implements Algorithm<LeakyBucketConfig> {
  constructor(public readonly config: LeakyBucketConfig) {}

  /**
   * Validates the leaky bucket configuration.
   *
   * Ensures the configured capacity and leak rate are positive values.
   *
   * @throws BadArgumentsException
   * Thrown if:
   * - `capacity <= 0`
   * - `leakRate <= 0`
   */
  validate(): void {
    if (this.config.capacity <= 0)
      throw new BadArgumentsException(
        `Expected capacity to be positive, got capacity=${this.config.capacity}`,
      );
    if (this.config.leakRate <= 0)
      throw new BadArgumentsException(
        `Expected leakRate to be positive, got leakRate=${this.config.leakRate}`,
      );
  }
}
