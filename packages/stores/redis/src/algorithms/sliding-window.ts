import { SlidingWindow } from "@limitkit/core";
import { RedisCompatible } from "../types";

/**
 * Redis implementation of the Sliding Window rate limiting algorithm.
 *
 * This class adapts the core {@link SlidingWindow} algorithm for use with
 * {@link RedisStore} by providing a Lua script that executes the algorithm
 * atomically inside Redis.
 *
 * ## Algorithm
 *
 * Sliding Window tracks each request within a moving time window. Unlike
 * Fixed Window, requests are evaluated continuously rather than in discrete
 * buckets.
 *
 * The algorithm allows a request only if the number of requests within the
 * last `window` duration does not exceed the configured limit.
 *
 * ## Redis State
 *
 * Requests are stored in a Redis **sorted set** where:
 *
 * - member → unique request identifier
 * - score → request timestamp (ms)
 *
 * ```text
 * key (sorted set)
 * ├─ score: timestamp
 * └─ member: unique request id
 * ```
 *
 * Expired entries are removed using `ZREMRANGEBYSCORE`.
 *
 * ## Atomic Execution
 *
 * The rate limiting logic runs entirely inside a Redis Lua script executed
 * via `EVALSHA`, ensuring atomic behavior even under heavy concurrency.
 *
 * ## Lua Arguments
 *
 * ```text
 * KEYS[1] → rate limit key
 *
 * ARGV[1] → current timestamp (ms)
 * ARGV[2] → window size (ms)
 * ARGV[3] → limit
 * ARGV[4] → cost
 * ```
 *
 * ## Script Return Value
 *
 * ```text
 * {allowed, remaining, reset, retryAt}
 * ```
 *
 * - `allowed` – 1 if request is permitted
 * - `remaining` – remaining requests within the window
 * - `reset` – timestamp (ms) when capacity will refresh
 * - `retryAt` – seconds until next request may succeed
 *
 * @example
 * ```ts
 * const limiter = new RedisSlidingWindow({
 *   name: "sliding-window",
 *   limit: 100,
 *   window: 60
 * })
 *
 * const result = await store.consume("user-123", limiter, Date.now())
 * ```
 *
 * @see SlidingWindow
 * @see RedisStore
 */
export class RedisSlidingWindow
  extends SlidingWindow
  implements RedisCompatible
{
  luaScript: string = `
    local key = KEYS[1]

    local now = tonumber(ARGV[1])
    local window = tonumber(ARGV[2])
    local limit = tonumber(ARGV[3])
    local cost = tonumber(ARGV[4])

    -- remove expired entries
    redis.call("ZREMRANGEBYSCORE", key, "-inf", now - window)

    local size = redis.call("ZCARD", key)

    -- reject
    if size + cost > limit then
      local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
      local newest = redis.call("ZRANGE", key, -1, -1, "WITHSCORES")

      if #oldest == 0 or #newest == 0 then
        return {0, limit, now + window, 0}
      end

      local oldestTime = tonumber(oldest[2])
      local reset = tonumber(newest[2]) + window
      local retryAt = oldestTime + window

      return {0, 0, reset, retryAt}
    end

    -- allow
    for i = 1, cost do
      local member = now .. "-" .. redis.call("INCR", key .. ":counter")
      redis.call("ZADD", key, now, member)
    end

    redis.call("PEXPIRE", key, window)
    redis.call("PEXPIRE", key .. ":counter", window)

    local remaining = limit - (size + cost)
    local reset = now + window

    return {1, remaining, reset, 0}
  `;

  get limit(): number {
    return this.config.limit;
  }

  getLuaArgs(now: number, cost: number): string[] {
    return [
      now.toString(),
      (this.config.window * 1000).toString(),
      this.config.limit.toString(),
      cost.toString(),
    ];
  }
}
