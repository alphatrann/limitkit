import {
  Algorithm,
  AlgorithmConfig,
  RateLimitRuleResult,
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
 * import { InMemoryStore, InMemoryFixedWindow } from "@limitkit/memory";
 *
 * const store = new InMemoryStore();
 * const config = new InMemoryFixedWindow({ name: "fixed-window", window: 60, limit: 100 });
 * const result = await store.consume('user-123', config, Date.now(), 1);
 * ```
 *
 * ## Characteristics
 * - **Atomic**: No race conditions
 * - **Non-persistent**: All state is lost when the process terminates
 * - **Single-instance**: Each InMemoryStore instance maintains its own isolated state map
 * - **Not distributed**: Cannot share state across multiple server instances
 * - **Algorithm agnostic**: The implementation delegates rate limiting logic to specific algorithm functions
 * - **Key-based storage**: Uses keys as-is (pre-modified by RateLimiter to ensure uniqueness)
 *
 * ## Concurrency Model
 *
 * The store guarantees atomic updates per key using a Promise queue.
 * Each key maintains a chain of Promises representing pending operations.
 * New operations are appended to the chain and executed sequentially.
 *
 * This ensures that concurrent `consume()` calls for the same key
 * cannot interleave state reads and writes, preventing race conditions.
 *
 * Example execution order:
 *
 * Request A → Request B → Request C
 *
 * Even if the requests arrive simultaneously, they will be processed
 * sequentially in the order they were queued.
 *
 * The queue is implemented by storing the tail Promise for each key
 * and chaining new operations using `prev.then(...)`.
 *
 * Errors are swallowed when updating the queue tail to prevent a
 * rejected Promise from breaking the chain.
 *
 * @remarks
 * - All operations are asynchronous to maintain API consistency with the Store interface
 * - State is preserved across calls, allowing accumulated rate limit tracking
 * - Key modification for config uniqueness is handled upstream by the RateLimiter
 * - Operations for the same key are serialized using a Promise-based queue to guarantee atomic state updates and prevent race conditions.
 *
 * @implements {Store}
 */
export class InMemoryStore implements Store {
  private queues = new Map<string, Promise<any>>();
  private map = new Map<string, State>();

  async consume<TState extends State, TConfig extends AlgorithmConfig>(
    key: string,
    algorithm: Algorithm<TConfig> & InMemoryCompatible<TState>,
    now: number,
    cost: number = 1,
  ): Promise<RateLimitRuleResult> {
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

    next.finally(() => {
      if (this.queues.get(key) === next) {
        this.queues.delete(key);
      }
    });

    return next;
  }
}
