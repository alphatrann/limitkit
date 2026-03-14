import { AlgorithmConfig } from "./algorithm-config";

/**
 * Represents an algorithm that can be executed
 * * @template TConfig - The configuration schema for the algorithm.
 */
export interface Algorithm<TConfig extends AlgorithmConfig> {
  /**
   * Readonly algorithm configuration
   */
  readonly config: TConfig;

  /**
   * Validate algorithm configuration values
   * @returns {void} If the configuration is valid
   * @throws BadArgumentsException If any of the values violate conditions
   */
  validate(): void;
}
