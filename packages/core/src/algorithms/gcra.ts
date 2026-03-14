import { BadArgumentsException } from "../exceptions";
import { Algorithm, GCRAConfig } from "../types";

export class GCRA implements Algorithm<GCRAConfig> {
  constructor(public readonly config: GCRAConfig) {}

  validate(): void {
    if (this.config.burst <= 0)
      throw new BadArgumentsException(
        `Expected burst to be positive, got burst=${this.config.burst}`,
      );

    if (this.config.interval <= 0)
      throw new BadArgumentsException(
        `Expected interval to be positive, got interval=${this.config.interval}`,
      );
  }
}
