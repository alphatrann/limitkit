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
import { createHash } from "crypto";

/**
 * In-memory implementation of the Store interface.
 *
 * Provides rate limiting functionality using various algorithms (Fixed Window, Sliding Window,
 * Sliding Window Counter, Token Bucket, Leaky Bucket, and GCRA) to track and enforce rate limits
 * for different keys in memory.
 *
 * @example
 * ```typescript
 * const store = new InMemoryStore();
 * const result = await store.consume('user-123', fixedWindowConfig, 1);
 * ```
 *
 * @remarks
 * - State is stored in a Map keyed by string identifiers
 * - All operations are asynchronous to maintain consistency with the Store interface
 * - Supports multiple rate limiting algorithms that can be selected per request
 */
export class InMemoryStore implements Store {
  private map = new Map<string, State>();

  async consume(
    key: string,
    { name, ...config }: AlgorithmConfig,
    cost: number = 1,
  ): Promise<RateLimitResult> {
    // Create a consistent config representation by sorting keys
    const sortedKeys = Object.keys(config).sort();
    const sortedConfig = sortedKeys.reduce((acc, k) => {
      acc[k] = (config as any)[k];
      return acc;
    }, {} as any);
    const configJson = JSON.stringify(sortedConfig);
    const hashedConfig = createHash("sha256").update(configJson).digest("hex");
    const modifiedKey = `ratelimit:${name}:${hashedConfig}:${key}`;
    const state = this.map.get(modifiedKey);

    const now = Date.now();
    let result: AlgorithmResult;
    switch (name) {
      case Algorithm.FixedWindow:
        result = fixedWindow(
          state as FixedWindowState,
          { name, ...config } as FixedWindowConfig,
          now,
          cost,
        );
        break;
      case Algorithm.SlidingWindow:
        result = slidingWindow(
          state as SlidingWindowState,
          { name, ...config } as SlidingWindowConfig,
          now,
          cost,
        );
        break;
      case Algorithm.SlidingWindowCounter:
        result = slidingWindowCounter(
          state as SlidingWindowCounterState,
          { name, ...config } as SlidingWindowCounterConfig,
          now,
          cost,
        );
        break;
      case Algorithm.TokenBucket:
        result = tokenBucket(
          state as TokenBucketState,
          { name, ...config } as TokenBucketConfig,
          now,
          cost,
        );
        break;
      case Algorithm.LeakyBucket:
        result = leakyBucket(
          state as LeakyBucketState,
          { name, ...config } as LeakyBucketConfig,
          now,
          cost,
        );
        break;
      case Algorithm.GCRA:
        result = gcra(
          state as GCRAState,
          { name, ...config } as GCRAConfig,
          now,
          cost,
        );
        break;
      default:
        throw new UnknownAlgorithmException(name);
    }

    this.map.set(modifiedKey, result.state);

    return result.output;
  }
}
