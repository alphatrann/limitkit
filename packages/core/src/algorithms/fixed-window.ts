import { BadArgumentsException } from "../exceptions";
import { Algorithm, FixedWindowConfig } from "../types";

/**
 * Base implementation of the **Fixed Window** rate limiting algorithm.
 *
 * This class provides the **shared configuration and validation logic**
 * for fixed window rate limiting but does **not perform rate limiting itself**.
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
 * - `InMemoryFixedWindow` — executes the algorithm using in-memory state
 * - `RedisFixedWindow` — executes the algorithm using Redis + Lua scripts
 *
 * ## Usage
 * End users typically **do not use this class directly**. Instead they should
 * use a store-specific implementation:
 *
 * ```ts
 * import { InMemoryFixedWindow } from "@limitkit/memory";
 *
 * const limiter = new InMemoryFixedWindow({
 *   name: "fixed-window",
 *   limit: 100,
 *   window: 60
 * });
 * ```
 *
 * @abstract
 * @implements {Algorithm<FixedWindowConfig>}
 */
export abstract class FixedWindow implements Algorithm<FixedWindowConfig> {
  constructor(public readonly config: FixedWindowConfig) {}

  /**
   * Validates the fixed window configuration.
   *
   * Ensures the configured window size and request limit are positive values.
   *
   * @throws BadArgumentsException
   * Thrown if:
   * - `limit <= 0`
   * - `window <= 0`
   */
  validate(): void {
    if (this.config.limit <= 0)
      throw new BadArgumentsException(
        `Expected limit to be positive, got limit=${this.config.limit}`,
      );

    if (this.config.window <= 0)
      throw new BadArgumentsException(
        `Expected window to be positive, got window=${this.config.window}`,
      );
  }
}
