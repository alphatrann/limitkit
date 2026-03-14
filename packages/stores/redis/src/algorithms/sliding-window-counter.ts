import { SlidingWindowCounter } from "@limitkit/core";
import { RedisCompatible } from "../types";

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
