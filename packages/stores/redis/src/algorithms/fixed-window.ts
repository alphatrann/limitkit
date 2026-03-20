import { FixedWindow } from "@limitkit/core";
import { RedisCompatible } from "../types";

/**
 * Redis implementation of the Fixed Window rate limiting algorithm.
 *
 * This class adapts the core {@link FixedWindow} algorithm to work with
 * {@link RedisStore} by providing a Lua script that performs the rate
 * limiting logic directly inside Redis.
 *
 * ## Algorithm
 *
 * Fixed Window divides time into discrete windows of equal size. Each
 * window tracks how many requests have been processed. Requests are
 * allowed until the configured limit is reached within the current window.
 *
 * When the window expires, the counter resets.
 *
 * ## Redis State
 *
 * The algorithm stores its state in a Redis hash:
 *
 * ```text
 * key
 * ├─ start  → window start timestamp (ms)
 * └─ count  → number of consumed tokens in the window
 * ```
 *
 * The key is automatically expired using `PEXPIRE` so stale windows
 * are cleaned up by Redis.
 *
 * ## Atomic Execution
 *
 * All rate limit logic runs inside a Lua script executed via `EVALSHA`,
 * guaranteeing atomic behavior even when multiple clients attempt to
 * consume tokens concurrently.
 *
 * ## Lua Script Arguments
 *
 * The script expects the following arguments:
 *
 * ```text
 * KEYS[1]  → rate limit key
 *
 * ARGV[1]  → current timestamp (ms)
 * ARGV[2]  → window size (ms)
 * ARGV[3]  → limit
 * ARGV[4]  → cost
 * ```
 *
 * ## Script Return Value
 *
 * The script returns a tuple:
 *
 * ```text
 * {allowed, remaining, reset, retryAt}
 * ```
 *
 * Where:
 *
 * - `allowed` – 1 if the request is permitted, 0 otherwise
 * - `remaining` – remaining tokens in the window
 * - `reset` – timestamp (ms) when the window resets
 * - `retryAt` – seconds until the next request may succeed
 *
 * @example
 * ```ts
 * const limiter = new RedisFixedWindow({
 *   name: "fixed-window",
 *   limit: 100,
 *   window: 60
 * })
 *
 * const result = await store.consume("user-123", limiter, Date.now())
 * ```
 *
 * @see FixedWindow
 * @see RedisStore
 */
export class RedisFixedWindow extends FixedWindow implements RedisCompatible {
  luaScript: string = `
    local key = KEYS[1]

    -- Arguments
    local now = tonumber(ARGV[1])
    local window = tonumber(ARGV[2])
    local limit = tonumber(ARGV[3])
    local cost = tonumber(ARGV[4])

    -- Load state
    local state = redis.call("HMGET", key, "start", "count")
    local windowStart = tonumber(state[1])
    local count = tonumber(state[2])

    -- Initialize window if it does not exist
    if not windowStart then
      windowStart = now - (now % window)
      count = 0
    end

    local isStillInCurrentWindow = now - windowStart < window
    local hasExceededLimit = count + cost > limit

    -- Reject request if limit would be exceeded
    if isStillInCurrentWindow and hasExceededLimit then
      local reset = windowStart + window
      return {0, 0, reset, reset}
    end

    -- Reset window if expired
    if not isStillInCurrentWindow then
      windowStart = now - (now % window)
      count = 0
    end

    -- Consume tokens
    count = count + cost

    -- Persist state
    redis.call("HSET", key, "start", windowStart, "count", count)
    redis.call("PEXPIRE", key, window)

    local remaining = limit - count
    local reset = windowStart + window

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
