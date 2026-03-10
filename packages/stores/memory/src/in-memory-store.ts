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
 * Provides rate limiting functionality using multiple algorithms (Fixed Window, Sliding Window,
 * Sliding Window Counter, Token Bucket, Leaky Bucket, and GCRA) to track and enforce rate limits
 * for identifiers (keys) in memory.
 *
 * ## State Management Strategy
 *
 * The store maintains independent rate limit state for each unique combination of:
 * - **Algorithm name**: The type of rate limiting algorithm (e.g., "fixed-window")
 * - **Algorithm configuration**: The specific parameters for that algorithm (e.g., window size, limit)
 * - **Key**: The identifier being rate limited (e.g., user ID, API token)
 *
 * This is achieved through composite key generation: `ratelimit:{name}:{configHash}:{key}`,
 * where `configHash` is a SHA-256 hash of the sorted config properties. This approach allows
 * the same key to maintain separate rate limit state for different configurations.
 *
 * @example
 * ```typescript
 * const store = new InMemoryStore();
 *
 * // Two different rate limit configs for the same key
 * const config1 = { name: Algorithm.FixedWindow, window: 60, limit: 100 };
 * const config2 = { name: Algorithm.FixedWindow, window: 60, limit: 200 };
 *
 * // These maintain independent state internally
 * const result1 = await store.consume('user-123', config1, 1); // state for config1
 * const result2 = await store.consume('user-123', config2, 1); // separate state for config2
 * ```
 *
 * ## Characteristics
 *
 * - **Non-persistent**: All state is lost when the process terminates
 * - **Single-instance**: Each InMemoryStore instance maintains its own isolated state map
 * - **Not distributed**: Cannot share state across multiple server instances
 * - **Algorithm agnostic**: The implementation delegates rate limiting logic to specific algorithm functions
 *
 * @remarks
 * - All operations are asynchronous to maintain API consistency with the Store interface
 * - State is preserved across calls, allowing accumulated rate limit tracking
 * - Configuration changes are detected via hash-based comparison, ensuring proper state isolation
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
