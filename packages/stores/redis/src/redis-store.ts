import {
  Algorithm,
  AlgorithmConfig,
  RateLimitRuleResult,
  Store,
} from "@limitkit/core";
import { RedisClientType } from "redis";
import { RedisCompatible } from "./types";

/**
 * Redis-based implementation of the Store interface.
 *
 * Provides distributed rate limiting using Redis as the shared state backend.
 * Multiple rate limiting algorithms are supported (Fixed Window, Sliding Window,
 * Sliding Window Counter, Token Bucket, Leaky Bucket, and GCRA) through
 * pluggable Lua scripts that execute atomically inside Redis.
 *
 * ## State Management
 *
 * Rate limit state is stored directly in Redis under the provided key.
 * Keys are pre-modified by the RateLimiter to include algorithm configuration
 * information, ensuring that multiple rate limiting rules can safely share
 * the same identifier without state collisions.
 *
 * Example transformed keys:
 *
 * ```text
 * rate-limiting:fixed-window:a1c2:user-123
 * rate-limiting:token-bucket:u3f8:user-123
 * ```
 *
 * Each algorithm provides a Lua script responsible for:
 *
 * - Reading current state
 * - Applying the rate limiting logic
 * - Updating the stored state
 * - Returning the result
 *
 * Because the script runs inside Redis, the operation is **fully atomic**
 * across all distributed clients.
 *
 * ## Script Loading Strategy
 *
 * Lua scripts are **lazily loaded** into Redis and cached locally using their
 * SHA hash. The first time a script is used it is loaded via `SCRIPT LOAD`
 * and the returned SHA is stored in memory.
 *
 * Subsequent executions use `EVALSHA`, which avoids sending the script
 * body over the network and improves performance.
 *
 * If Redis restarts and clears its script cache, a `NOSCRIPT` error is
 * automatically detected and the script is reloaded transparently.
 *
 * ## Characteristics
 *
 * - **Distributed**: Shares rate limit state across multiple server instances
 * - **Persistent**: State survives application restarts (depending on Redis persistence)
 * - **Atomic**: Lua scripts guarantee consistency in concurrent environments
 * - **Algorithm agnostic**: Algorithms supply their own Lua execution logic
 * - **High performance**: Scripts are cached using SHA hashes and executed via `EVALSHA`
 * - **Self-healing**: Automatically reloads scripts if Redis restarts
 *
 * @example
 * ```typescript
 * import { RedisStore, RedisFixedWindow } from '@limitkit/redis';
 * import { createClient } from 'redis';
 *
 * const redis = createClient();
 * await redis.connect();
 *
 * const store = new RedisStore(redis);
 *
 * const config = new RedisFixedWindow({
 *   name: "fixed-window",
 *   window: 60,
 *   limit: 100
 * });
 *
 * const result = await store.consume("user-123", config, Date.now(), 2);
 * ```
 *
 * @implements {Store}
 */
export class RedisStore implements Store {
  /**
   * Local cache mapping Lua script source → SHA hash.
   *
   * Redis identifies scripts by SHA1 hashes when executing `EVALSHA`.
   * This map ensures each script is loaded only once per process.
   *
   * Example:
   *
   * ```text
   * Map<
   *   luaScriptString,
   *   shaHash
   * >
   * ```
   *
   * If Redis restarts and clears its internal script cache, the stored SHA
   * may become invalid. In that case the store will detect the `NOSCRIPT`
   * error and reload the script automatically.
   */
  private scripts = new Map<string, string>();

  /**
   * Creates a new RedisStore instance.
   *
   * @param redis Connected Redis client instance
   */
  constructor(private redis: RedisClientType) {}

  /**
   * Consumes rate limit tokens for a given key using the configured algorithm.
   *
   * The algorithm supplies a Lua script which performs the rate limiting
   * logic inside Redis. This ensures the operation is atomic even when
   * multiple clients attempt to consume tokens simultaneously.
   *
   * Execution flow:
   *
   * 1. Validate algorithm configuration
   * 2. Ensure the Lua script is loaded in Redis
   * 3. Execute the script using `EVALSHA`
   * 4. If Redis reports `NOSCRIPT`, reload and retry
   *
   * @param key
   * The rate limit identifier (e.g., user ID, IP address, API key).
   *
   * @param algorithm
   * The rate limiting algorithm implementation providing Lua execution logic.
   *
   * @param now
   * Current Unix timestamp in **milliseconds**.
   *
   * @param cost
   * Number of tokens to consume (default: 1).
   *
   * @returns Promise resolving to a RateLimitResult containing:
   *
   * - `allowed` — whether the request is permitted
   * - `limit` — maximum number of allowed requests
   * - `remaining` — remaining tokens/requests
   * - `reset` — timestamp when the limit resets
   * - `availableAt` — seconds until the request may be retried
   *
   * @throws BadArgumentsException
   * If the algorithm configuration is invalid.
   */
  async consume<TConfig extends AlgorithmConfig>(
    key: string,
    algorithm: Algorithm<TConfig> & RedisCompatible,
    now: number,
    cost: number = 1,
  ): Promise<RateLimitRuleResult> {
    // Validate algorithm configuration before executing the script
    algorithm.validate();

    /**
     * Retrieve cached SHA for the Lua script.
     *
     * If the script has not been used before, it will be loaded into Redis
     * and the returned SHA cached locally.
     */
    let sha = this.scripts.get(algorithm.luaScript);

    if (!sha) {
      sha = await this.redis.scriptLoad(algorithm.luaScript);
      this.scripts.set(algorithm.luaScript, sha);
    }

    const args = algorithm.getLuaArgs(now, cost);

    try {
      /**
       * Execute the Lua script using EVALSHA.
       *
       * This avoids sending the script body across the network and
       * significantly reduces request overhead.
       */
      const [allowed, remaining, resetAt, availableAt] =
        (await this.redis.evalSha(sha, {
          keys: [key],
          arguments: args,
        })) as [number, number, number, number];

      return {
        allowed: !!allowed,
        limit: algorithm.limit,
        remaining,
        resetAt,
        availableAt: availableAt === 0 ? undefined : availableAt,
      };
    } catch (err: any) {
      /**
       * Redis may lose its script cache if it restarts.
       *
       * When this happens `EVALSHA` throws a `NOSCRIPT` error.
       * We recover by reloading the script and retrying the call.
       */
      if (err?.message?.includes("NOSCRIPT")) {
        sha = await this.redis.scriptLoad(algorithm.luaScript);
        this.scripts.set(algorithm.luaScript, sha);

        const [allowed, remaining, resetAt, availableAt] =
          (await this.redis.evalSha(sha, {
            keys: [key],
            arguments: args,
          })) as [number, number, number, number];

        return {
          allowed: !!allowed,
          limit: algorithm.limit,
          remaining,
          resetAt,
          availableAt: availableAt === 0 ? undefined : availableAt,
        };
      }

      throw err;
    }
  }
}
