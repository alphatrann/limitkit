import { BadArgumentsException } from "../exceptions";
import { Algorithm, FixedWindowConfig } from "../types";

/**
 * Base fixed window validation logic.
 * @note This class only includes the configuration object and validation code, the execution depends on the store
 * @example
 * ```ts
 * const fixedWindow = new FixedWindow({ name: "fixed-window", window: 60, limit: 100 });
 * ```
 */
export class FixedWindow implements Algorithm<FixedWindowConfig> {
  constructor(public readonly config: FixedWindowConfig) {}

  /**
   * Validate fixed window configuration, which consists of window size and window limit
   * @returns {void} If the configuration is valid
   * @throws BadArgumentsException If either window size or window limit is not positive
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
