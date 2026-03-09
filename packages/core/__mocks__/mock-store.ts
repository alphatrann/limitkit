import { AlgorithmConfig, RateLimitResult, Store } from "../src/types";

export class MockStore implements Store {
  async consume(
    key: string,
    algorithm: AlgorithmConfig,
    cost?: number,
  ): Promise<RateLimitResult> {
    return await Promise.resolve({
      allowed: true,
      remaining: 1,
      reset: Date.now(),
    });
  }
}
