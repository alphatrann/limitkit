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

/**
 * In-memory implementation of the Store interface.
 *
 * Provides rate limiting functionality using multiple algorithms (Fixed Window, Sliding Window,
 * Sliding Window Counter, Token Bucket, Leaky Bucket, and GCRA) to track and enforce rate limits
 * for identifiers (keys) in memory.
 *
 * ## State Management
 *
 * The store maintains rate limit state for each key. Keys are pre-modified by the RateLimiter
 * to include algorithm configuration information, ensuring different rate limit rules can share
 * identifiers without state collision. The store receives these modified keys and treats them
 * as simple string identifiers.
 *
 * @example
 * ```typescript
 * const store = new InMemoryStore();
 * const config = { name: Algorithm.FixedWindow, window: 60, limit: 100 };
 * const result = await store.consume('user-123', config, 1);
 * ```
 *
 * ## Characteristics
 *
 * - **Non-persistent**: All state is lost when the process terminates
 * - **Single-instance**: Each InMemoryStore instance maintains its own isolated state map
 * - **Not distributed**: Cannot share state across multiple server instances
 * - **Algorithm agnostic**: The implementation delegates rate limiting logic to specific algorithm functions
 * - **Key-based storage**: Uses keys as-is (pre-modified by RateLimiter to ensure uniqueness)
 *
 * @remarks
 * - All operations are asynchronous to maintain API consistency with the Store interface
 * - State is preserved across calls, allowing accumulated rate limit tracking
 * - Key modification for config uniqueness is handled upstream by the RateLimiter
 */
export class InMemoryStore implements Store {
  private map = new Map<string, State>();

  async consume(
    key: string,
    { name, ...config }: AlgorithmConfig,
    cost: number = 1,
  ): Promise<RateLimitResult> {
    // Create a consistent config representation by sorting keys
    const state = this.map.get(key);

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

    this.map.set(key, result.state);

    return result.output;
  }
}
