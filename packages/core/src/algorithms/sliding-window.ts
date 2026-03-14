import { BadArgumentsException } from "../exceptions";
import { Algorithm, SlidingWindowConfig } from "../types";

/**
 * Base slididing window validation logic.
 * @note This class only includes the configuration object and validation code, the execution depends on the store
 * @example
 * ```ts
 * const slidingWindow = new SlidingWindow({ name: "sliding-window", window: 60, limit: 100 });
 * ```
 */
export class SlidingWindow implements Algorithm<SlidingWindowConfig> {
  constructor(public readonly config: SlidingWindowConfig) {}

  /**
   * Validate sliding window configuration, which consists of window size and window limit
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
