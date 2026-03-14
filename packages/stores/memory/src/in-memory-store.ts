import {
  Algorithm,
  AlgorithmConfig,
  RateLimitResult,
  Store,
} from "@limitkit/core";
import { InMemoryCompatible, State } from "./types";

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
 * const config = { name: "fixed-window", window: 60, limit: 100 };
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
  private queues = new Map<string, Promise<any>>();
  private map = new Map<string, State>();

  async consume<TState extends State, TConfig extends AlgorithmConfig>(
    key: string,
    algorithm: Algorithm<TConfig> & InMemoryCompatible<TState>,
    now: number,
    cost: number = 1,
  ): Promise<RateLimitResult> {
    algorithm.validate();
    const prev = this.queues.get(key) ?? Promise.resolve();
    const next = prev.then(() => {
      const state = this.map.get(key);
      const result = algorithm.process(state as TState | undefined, now, cost);
      this.map.set(key, result.state);
      return result.output;
    });

    this.queues.set(
      key,
      next.catch(() => {}),
    );

    return next;
  }
}
