import {
  Algorithm,
  AlgorithmConfig,
  FixedWindowConfig,
  GCRAConfig,
  LeakyBucketConfig,
  RateLimitResult,
  SlidingWindowConfig,
  SlidingWindowCounterConfig,
  Store,
  TokenBucketConfig,
  UnknownAlgorithmException,
} from "@limitkit/core";
import {
  AlgorithmResult,
  FixedWindowState,
  GCRAState,
  LeakyBucketState,
  SlidingWindowCounterState,
  SlidingWindowState,
  State,
  TokenBucketState,
} from "./types";
import {
  fixedWindow,
  gcra,
  leakyBucket,
  slidingWindow,
  slidingWindowCounter,
  tokenBucket,
} from "./algorithms";

export class InMemoryStore implements Store {
  private map = new Map<string, State>();

  async consume(
    key: string,
    algorithm: AlgorithmConfig,
    cost: number = 1,
  ): Promise<RateLimitResult> {
    const state = this.map.get(key);

    const now = Date.now();
    let result: AlgorithmResult;
    switch (algorithm.name) {
      case Algorithm.FixedWindow:
        result = fixedWindow(
          state as FixedWindowState,
          algorithm as FixedWindowConfig,
          now,
          cost,
        );
        break;
      case Algorithm.SlidingWindow:
        result = slidingWindow(
          state as SlidingWindowState,
          algorithm as SlidingWindowConfig,
          now,
          cost,
        );
        break;
      case Algorithm.SlidingWindowCounter:
        result = slidingWindowCounter(
          state as SlidingWindowCounterState,
          algorithm as SlidingWindowCounterConfig,
          now,
          cost,
        );
        break;
      case Algorithm.TokenBucket:
        result = tokenBucket(
          state as TokenBucketState,
          algorithm as TokenBucketConfig,
          now,
          cost,
        );
        break;
      case Algorithm.LeakyBucket:
        result = leakyBucket(
          state as LeakyBucketState,
          algorithm as LeakyBucketConfig,
          now,
          cost,
        );
        break;
      case Algorithm.GCRA:
        result = gcra(state as GCRAState, algorithm as GCRAConfig, now, cost);
        break;
      default:
        throw new UnknownAlgorithmException(algorithm.name);
    }

    this.map.set(key, result.state);

    return result.output;
  }
}
