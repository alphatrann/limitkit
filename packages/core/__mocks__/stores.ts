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

  async peek<TConfig extends AlgorithmConfig>(
    key: string,
    algorithm: Algorithm<TConfig>,
    now: number,
    cost?: number,
  ): Promise<RateLimitRuleResult> {
    return this.consume(key, algorithm, now, cost);
  }
}

export class SpyStore implements Store {
  calls: Array<{
    key: string;
    algorithm: AlgorithmConfig;
    now: number;
    cost: number;
  }> = [];

  peekCalls: SpyStore['calls'] = [];

  constructor(private delegate: Store) {}

  async consume<TConfig extends AlgorithmConfig>(
    key: string,
    algorithm: Algorithm<TConfig>,
    now: number,
    cost: number = 1,
  ) {
    this.calls.push({
      key,
      algorithm: algorithm.config,
      now,
      cost,
    });
    return this.delegate.consume(key, algorithm, now, cost);
  }

  async peek<TConfig extends AlgorithmConfig>(
    key: string,
    algorithm: Algorithm<TConfig>,
    now: number,
    cost: number = 1,
  ) {
    this.peekCalls.push({ key, algorithm: algorithm.config, now, cost });
    return this.delegate.peek!(key, algorithm, now, cost);
  }
}
