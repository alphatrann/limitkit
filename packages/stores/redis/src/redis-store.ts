import {
  Algorithm,
  AlgorithmConfig,
  RateLimitResult,
  Store,
} from "@limitkit/core";
import { RedisClientType } from "redis";
import { RedisCompatible } from "./types";

/**
 * Redis-based implementation of the Store interface.
 *
 * Provides rate limiting functionality using multiple algorithms (Fixed Window, Sliding Window,
 * Sliding Window Counter, Token Bucket, Leaky Bucket, and GCRA) to track and enforce rate limits
 * for identifiers (keys) in Redis.
 *
 * ## State Management
 *
 * The store maintains rate limit state for each key in Redis using Lua scripts for atomic
 * operations. Keys are pre-modified by the RateLimiter to include algorithm configuration
 * information, ensuring different rate limit rules can share identifiers without state collision.
 * The store receives these modified keys and uses them as Redis keys.
 *
 * @example
 * ```typescript
 * import { RedisStore } from '@limitkit/redis';
 * import { createClient } from 'redis';
 *
 * const redis = createClient();
 * await redis.connect();
 * const store = new RedisStore(redis);
 * await store.init();
 * const config = { name: "fixed-window", window: 60, limit: 100 };
 * const result = await store.consume('user-123', config, 1);
 * ```
 *
 * ## Characteristics
 *
 * - **Distributed**: Shares state across multiple server instances via Redis
 * - **Persistent**: Rate limit state survives process restarts (if Redis persists)
 * - **Atomic operations**: Uses Lua scripts to ensure consistency in concurrent environments
 * - **Algorithm agnostic**: Supports multiple rate limiting algorithms via pluggable Lua scripts
 * - **High performance**: Pre-loads scripts into Redis using SHA hashes to minimize overhead
 *
 * @remarks
 * - Requires calling init() before using the store to load Lua scripts
 * - All operations are asynchronous to work with async Redis client
 * - State is persisted in Redis and shared across all instances connected to that Redis server
 * - Key modification for config uniqueness is handled upstream by the RateLimiter
 * - Supports custom Clock implementations for testing via dependency injection
 *
 * @implements {Store}
 */
export class RedisStore implements Store {
  /**
   * Creates a new RedisStore instance.
   *
   * @param redis - Connected Redis client instance
   */
  constructor(private redis: RedisClientType) {}

  /**
   * Consumes rate limit tokens for a given key using the configured algorithm.
   *
   * Executes the appropriate Lua script based on the algorithm type to atomically
   * check limits and update state in Redis. Validates configuration parameters
   * based on algorithm requirements.
   *
   * @param key - The rate limit key (e.g., user ID, IP address, or other identifier)
   * @param algorithm - The algorithm executor object
   * @param now - Unix timestamp in millisecond
   * @param cost - Number of tokens to consume (default: 1)
   *
   * @returns Promise resolving to RateLimitResult containing:
   *          - limit: The maximum number of requests the client can send
   *          - allowed: Whether the request is allowed
   *          - remaining: Tokens/requests remaining in current window
   *          - reset: Unix timestamp when the limit resets
   *          - retryAfter: Seconds to wait before retrying if denied
   *
   * @throws UnknownAlgorithmException if algorithm is not supported
   * @throws BadArgumentsException if configuration parameters are invalid
   */
  async consume<TConfig extends AlgorithmConfig>(
    key: string,
    algorithm: Algorithm<TConfig> & RedisCompatible,
    now: number,
    cost: number = 1,
  ): Promise<RateLimitResult> {
    algorithm.validate();
    const sha = await this.redis.scriptLoad(algorithm.luaScript);
    const args = algorithm.getLuaArgs(now, cost);
    const [allowed, remaining, reset, retryAfter] = (await this.redis.evalSha(
      sha,
      { keys: [key], arguments: args },
    )) as [number, number, number, number];
    return {
      allowed: !!allowed,
      limit: algorithm.limit,
      remaining,
      reset,
      retryAfter,
    };
  }
}
