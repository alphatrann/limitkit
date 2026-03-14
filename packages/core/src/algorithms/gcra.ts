import { BadArgumentsException } from "../exceptions";
import { Algorithm, GCRAConfig } from "../types";

/**
 * Base implementation of the **GCRA** rate limiting algorithm.
 *
 * This class provides the **shared configuration and validation logic**
 * for sliding window counter rate limiting but does **not perform rate limiting itself**.
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
 * - `InMemoryGCRA` — executes the algorithm using in-memory state
 * - `RedisGCRA` — executes the algorithm using Redis + Lua scripts
 *
 * ## Usage
 * End users typically **do not use this class directly**. Instead they should
 * use a store-specific implementation:
 *
 * ```ts
 * import { InMemoryGCRA } from "@limitkit/memory";
 *
 * const limiter = new InMemoryGCRA({
 *   name: "gcra",
 *   burst: 5,
 *   interval: 1
 * });
 * ```
 *
 * @abstract
 * @implements {Algorithm<GCRAConfig>}
 */
export abstract class GCRA implements Algorithm<GCRAConfig> {
  constructor(public readonly config: GCRAConfig) {}

  /**
   * Validates the GCRA configuration.
   *
   * Ensures the configured burst and interval are positive values.
   *
   * @throws BadArgumentsException
   * Thrown if:
   * - `burst <= 0`
   * - `interval <= 0`
   */
  validate(): void {
    if (this.config.burst <= 0)
      throw new BadArgumentsException(
        `Expected burst to be positive, got burst=${this.config.burst}`,
      );

    if (this.config.interval <= 0)
      throw new BadArgumentsException(
        `Expected interval to be positive, got interval=${this.config.interval}`,
      );
  }
}
