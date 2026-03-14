import { BadArgumentsException } from "../exceptions";
import { Algorithm, SlidingWindowConfig } from "../types";

export class SlidingWindow implements Algorithm<SlidingWindowConfig> {
  constructor(public readonly config: SlidingWindowConfig) {}

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
