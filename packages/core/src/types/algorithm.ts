import { AlgorithmConfig } from "./algorithm-config";

export interface Algorithm<TConfig extends AlgorithmConfig> {
  readonly config: TConfig;
  validate(): void;
}
