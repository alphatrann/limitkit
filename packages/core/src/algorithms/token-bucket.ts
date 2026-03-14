import { BadArgumentsException } from "../exceptions";
import { Algorithm, TokenBucketConfig } from "../types";

/**
 * Base token bucket validation logic.
 * @note This class only includes the configuration object and validation code, the execution depends on the store
 * @example
 * ```ts
 * const tokenBucket = new TokenBucket({ name: "token-bucket", refillRate: 2, capacity: 100 });
 * ```
 *
 * @see {@link https://en.wikipedia.org/wiki/Token_bucket}
 */
export class TokenBucket implements Algorithm<TokenBucketConfig> {
  constructor(public readonly config: TokenBucketConfig) {}

  /**
   * Validate token bucket configuration, which consists of refill rate (per second) and capacity
   * @returns {void} If the configuration is valid
   * @throws BadArgumentsException If either capacity or refill rate is not positive
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
