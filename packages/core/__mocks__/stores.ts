import { AlgorithmConfig, RateLimitResult, Store } from "../src/types";

export class MockStore implements Store {
  async consume(
    key: string,
    algorithm: AlgorithmConfig,
    cost?: number,
  ): Promise<RateLimitResult> {
    return await Promise.resolve({
      allowed: true,
      limit: 1,
      remaining: 1,
      reset: Date.now(),
    });
  }
}

export class SpyStore implements Store {
  calls: Array<{
    key: string;
    algorithm: any;
    now: number;
    cost: number;
  }> = [];

  constructor(private delegate: Store) {}

  async consume(key: string, algorithm: any, now: number, cost: number = 1) {
    this.calls.push({ key, algorithm, now, cost });
    return this.delegate.consume(key, algorithm, now, cost);
  }
}
