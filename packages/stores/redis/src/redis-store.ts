import {
  Algorithm,
  AlgorithmConfig,
  BadArgumentsException,
  RateLimitResult,
  Store,
  UnknownAlgorithmException,
} from "@limitkit/core";
import { RedisClientType } from "redis";
import * as fs from "fs/promises";
import * as path from "path";
import { Clock } from "./types";
import { SystemClock } from "./system-clock";

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
 * const config = { name: Algorithm.FixedWindow, window: 60, limit: 100 };
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
  /** Map of algorithm names to their preloaded Redis Lua script SHAs */
  private scriptsSha = new Map<string, string>();

  /** Flag indicating whether Lua scripts have been loaded into Redis */
  private scriptsLoaded = false;

  /**
   * Creates a new RedisStore instance.
   *
   * @param redis - Connected Redis client instance
   * @param clock - Optional clock implementation for getting current time.
   *               Defaults to SystemClock if not provided. Useful for testing.
   */
  constructor(
    private redis: RedisClientType,
    private clock: Clock = new SystemClock(),
  ) {}

  /**
   * Initializes the store by loading all rate limiting algorithm scripts into Redis.
   *
   * Must be called before using the store. Idempotent - safe to call multiple times.
   * Loads Lua scripts for each supported algorithm and caches their SHAs for efficient execution.
   *
   * @returns RedisStore instance itself
   * @throws Error if Redis connection fails or scripts cannot be read
   */
  async init(): Promise<RedisStore> {
    if (this.scriptsLoaded) return this;
    await this.loadScripts();
    this.scriptsLoaded = true;
    return this;
  }

  /**
   * Loads all rate limiting Lua scripts into Redis and caches their SHAs.
   *
   * Each algorithm has a corresponding Lua script that implements atomic rate limiting logic.
   * Scripts are loaded into Redis and their SHAs (secure hash algorithm values) are cached
   * for efficient script execution via evalSha commands.
   *
   * @private
   * @returns Promise that resolves when all scripts are loaded
   * @throws Error if a script file cannot be read or Redis command fails
   */
  private async loadScripts() {
    const algorithms = Object.values(Algorithm);
    for (const algorithm of algorithms) {
      const scriptPath = path.join(__dirname, "scripts", `${algorithm}.lua`);
      const script = await fs.readFile(scriptPath, "utf-8");
      const sha = await this.redis.scriptLoad(script);
      this.scriptsSha.set(algorithm, sha);
    }
  }

  /**
   * Consumes rate limit tokens for a given key using the configured algorithm.
   *
   * Executes the appropriate Lua script based on the algorithm type to atomically
   * check limits and update state in Redis. Validates configuration parameters
   * based on algorithm requirements.
   *
   * @param key - The rate limit key (e.g., user ID, IP address, or other identifier)
   * @param config - Algorithm configuration containing:
   *                 - name: Algorithm identifier (FixedWindow, TokenBucket, etc.)
   *                 - window: Time window in seconds (for window-based algorithms)
   *                 - limit: Maximum allowed requests in window
   *                 - capacity: Bucket capacity (for bucket algorithms)
   *                 - refillRate: Token refill rate (for TokenBucket)
   *                 - leakRate: Leak rate (for LeakyBucket)
   *                 - burst: Burst tolerance (for GCRA)
   *                 - interval: Time interval (for GCRA)
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
  async consume(
    key: string,
    config: AlgorithmConfig,
    cost: number = 1,
  ): Promise<RateLimitResult> {
    const sha = this.scriptsSha.get(config.name);
    if (!sha) throw new UnknownAlgorithmException(config.name);
    const now = this.clock.now();

    let allowed: number;
    let remaining: number;
    let reset: number;
    let retryAfter: number;
    let limit: number;

    switch (config.name) {
      case Algorithm.FixedWindow:
      case Algorithm.SlidingWindow:
      case Algorithm.SlidingWindowCounter:
        limit = config.limit;
        [allowed, remaining, reset, retryAfter] = (await this.redis.evalSha(
          sha,
          {
            keys: [key],
            arguments: [
              now.toString(),
              (config.window * 1000).toString(),
              config.limit.toString(),
              cost.toString(),
            ],
          },
        )) as [number, number, number, number];
        break;
      case Algorithm.TokenBucket:
        if (config.capacity <= 0)
          throw new BadArgumentsException(
            `Capacity must be a positive integer, got capacity=${config.capacity}`,
          );

        if (config.refillRate <= 0)
          throw new BadArgumentsException(
            `Refill rate must be a positive integer, got refill_rate=${config.refillRate}`,
          );
        limit = config.capacity;
        [allowed, remaining, reset, retryAfter] = (await this.redis.evalSha(
          sha,
          {
            keys: [key],
            arguments: [
              now.toString(),
              config.refillRate.toString(),
              config.capacity.toString(),
              cost.toString(),
            ],
          },
        )) as [number, number, number, number];
        break;
      case Algorithm.LeakyBucket:
        if (config.capacity <= 0)
          throw new BadArgumentsException(
            `Capacity must be a positive integer, got capacity=${config.capacity}`,
          );
        if (config.leakRate <= 0)
          throw new BadArgumentsException(
            `Leak rate must be a positive integer, got leak_rate=${config.leakRate}`,
          );
        limit = config.capacity;
        [allowed, remaining, reset, retryAfter] = (await this.redis.evalSha(
          sha,
          {
            keys: [key],
            arguments: [
              now.toString(),
              config.leakRate.toString(),
              config.capacity.toString(),
              cost.toString(),
            ],
          },
        )) as [number, number, number, number];
        break;
      case Algorithm.GCRA:
        if (config.burst <= 0)
          throw new BadArgumentsException(
            `Burst must be a positive integer, got burst=${config.burst}`,
          );

        if (config.interval <= 0)
          throw new BadArgumentsException(
            `Interval must be a positive integer, got interval=${config.interval}`,
          );

        if (cost > config.burst)
          throw new BadArgumentsException(
            `Cost must never exceed burst, got burst=${config.interval}, cost=${cost}`,
          );
        limit = config.burst;
        [allowed, remaining, reset, retryAfter] = (await this.redis.evalSha(
          sha,
          {
            keys: [key],
            arguments: [
              now.toString(),
              (config.interval * 1000).toString(),
              config.burst.toString(),
              cost.toString(),
            ],
          },
        )) as [number, number, number, number];
        break;
    }

    return { allowed: !!allowed, limit, remaining, reset, retryAfter };
  }
}
