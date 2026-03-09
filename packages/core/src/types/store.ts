import { AlgorithmConfig } from "./algorithm-config";
import { RateLimitResult } from "./rate-limit-result";

export interface Store {
  consume(
    key: string,
    algorithm: AlgorithmConfig,
    cost?: number,
  ): Promise<RateLimitResult>;
}
