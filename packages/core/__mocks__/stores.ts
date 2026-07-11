import {
  Algorithm,
  AlgorithmConfig,
  RateLimitRuleResult,
  Store,
} from '../src/types';

export class MockStore implements Store {
  async consume<TConfig extends AlgorithmConfig>(
    key: string,
    algorithm: Algorithm<TConfig>,
    now: number,
    cost?: number,
  ): Promise<RateLimitRuleResult> {
    return await Promise.resolve({
      allowed: true,
      limit: 1,
      remaining: 1,
      resetAt: Date.now(),
    });
  }
}

export class SpyStore implements Store {
  calls: Array<{
    key: string;
    algorithm: AlgorithmConfig;
    now: number;
    cost: number;
  }> = [];

  constructor(private delegate: Store) {}

  async consume<TConfig extends AlgorithmConfig>(
    key: string,
    algorithm: Algorithm<TConfig>,
    now: number,
    cost: number = 1,
  ) {
    this.calls.push({ key, algorithm: algorithm.config, now, cost });
    return this.delegate.consume(key, algorithm, now, cost);
  }
}
