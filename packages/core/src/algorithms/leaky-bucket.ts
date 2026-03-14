import { BadArgumentsException } from "../exceptions";
import { Algorithm, LeakyBucketConfig } from "../types";

export class LeakyBucket implements Algorithm<LeakyBucketConfig> {
  constructor(public readonly config: LeakyBucketConfig) {}

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
