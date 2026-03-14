import { SlidingWindowCounter } from "@limitkit/core";
import { RedisCompatible } from "../types";

/**
 * Redis implementation of the Sliding Window Counter rate limiting algorithm.
 *
 * This algorithm approximates Sliding Window behavior using two counters:
 * one for the current window and one for the previous window. The effective
 * request count is calculated using weighted interpolation between the two.
 *
 * ## Algorithm
 *
 * The effective request count is computed as:
 *
 * ```text
 * effective = currentCount + (1 - progress) * previousCount
 * ```
 *
 * where `progress` represents the percentage of time elapsed in the current
 * window.
 *
 * This provides a close approximation to Sliding Window while using
 * significantly less storage.
 *
 * ## Redis State
 *
 * State is stored in a Redis hash:
 *
 * ```text
 * key
 * ├─ start → window start timestamp
 * ├─ count → requests in current window
 * └─ prev  → requests in previous window
 * ```
 *
 * The key expires automatically after two window durations.
 *
 * ## Atomic Execution
 *
 * The algorithm is executed inside Redis using Lua to guarantee atomic
 * updates across concurrent clients.
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
 * {allowed, remaining, reset, retryAfter}
 * ```
 *
 * @see SlidingWindowCounter
 * @see RedisStore
 */
export class RedisSlidingWindowCounter
  extends SlidingWindowCounter
  implements RedisCompatible
{
  luaScript: string = `
    local key = KEYS[1]

    local now = tonumber(ARGV[1])
    local window = tonumber(ARGV[2]) -- in ms
    local limit = tonumber(ARGV[3])
    local cost = tonumber(ARGV[4])

    local state = redis.call("HMGET", key, "start", "count", "prev");

    local windowStart = tonumber(state[1])
    local count = tonumber(state[2])
    local prevCount = tonumber(state[3])

    if not windowStart then
      windowStart = now - (now % window)
      count = 0
      prevCount = 0
    end

    local elapsed = now - windowStart
    if elapsed >= window then
      local windowsPassed = math.floor(elapsed / window)
      if windowsPassed == 1 then
        prevCount = count
      else
        prevCount = 0
      end
      count = 0
      windowStart = windowStart + windowsPassed * window
      elapsed = now - windowStart
    end

    local progress = elapsed / window
    local effective = count + (1 - progress) * prevCount
    local reset = 2 * window + windowStart

    if effective + cost > limit then
      local retryAfter = math.max(
        0,
        math.ceil((windowStart + window - now) / 1000)
      ) -- in seconds
      return {0, 0, reset, retryAfter} -- {allowed, remaining, reset, retryAfter}
    end

    count = count + cost
    redis.call("HSET", key, "start", windowStart, "count", count, "prev", prevCount)
    redis.call("PEXPIRE", key, window * 2)

    local remaining = math.max(
      0,
      math.floor(limit - (effective + cost))
    )

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
