import { BadArgumentsException } from "../exceptions";
import { Algorithm, TokenBucketConfig } from "../types";

export class TokenBucket implements Algorithm<TokenBucketConfig> {
  constructor(public readonly config: TokenBucketConfig) {}

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
