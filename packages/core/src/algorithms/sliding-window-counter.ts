import { BadArgumentsException } from "../exceptions";
import { Algorithm, SlidingWindowCounterConfig } from "../types";

/**
 * Base sliding window counter validation logic.
 * @note This class only includes the configuration object and validation code, the execution depends on the store
 * @example
 * ```ts
 * const slidingWindowCounter = new SlidingWindowCounter({ name: "sliding-window-counter", window: 60, limit: 100 });
 * ```
 */
export class SlidingWindowCounter implements Algorithm<SlidingWindowCounterConfig> {
  constructor(public readonly config: SlidingWindowCounterConfig) {}

  /**
   * Validate sliding window counter configuration, which consists of window size and window limit
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
