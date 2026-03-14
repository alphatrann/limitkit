import { BadArgumentsException } from "../exceptions";
import { Algorithm, SlidingWindowCounterConfig } from "../types";

export class SlidingWindowCounter implements Algorithm<SlidingWindowCounterConfig> {
  constructor(public readonly config: SlidingWindowCounterConfig) {}

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
