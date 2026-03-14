import { BadArgumentsException } from "../exceptions";
import { Algorithm, LeakyBucketConfig } from "../types";

/**
 * Base leaky bucket validation logic.
 * @note This class only includes the configuration object and validation code, the execution depends on the store
 * @example
 * ```ts
 * const leakyBucket = new LeakyBucket({ name: "leaky-bucket", leakRate: 2, capacity: 100 });
 * ```
 *
 * @see {@link https://en.wikipedia.org/wiki/Leaky_bucket}
 */
export class LeakyBucket implements Algorithm<LeakyBucketConfig> {
  constructor(public readonly config: LeakyBucketConfig) {}

  /**
   * Validate leaky bucket configuration, which consists of leak rate (per second) and capacity
   * @returns {void} If the configuration is valid
   * @throws BadArgumentsException If either capacity or leak rate is not positive
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
