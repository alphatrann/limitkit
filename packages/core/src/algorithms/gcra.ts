import { BadArgumentsException } from "../exceptions";
import { Algorithm, GCRAConfig } from "../types";

/**
 * Base GCRA validation logic.
 * @note This class only includes the configuration object and validation code, the execution depends on the store
 * @example
 * ```ts
 * const gcra = new GCRA({ name: "gcra", burst: 10, interval: 1 });
 * ```
 *
 * @see {@link https://en.wikipedia.org/wiki/Generic_cell_rate_algorithm}
 */
export class GCRA implements Algorithm<GCRAConfig> {
  constructor(public readonly config: GCRAConfig) {}

  /**
   * Validate GCRA configuration, which consists of interval (in seconds) and burst
   * @returns {void} If the configuration is valid
   * @throws BadArgumentsException If either interval or burst is not positive
   */
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
