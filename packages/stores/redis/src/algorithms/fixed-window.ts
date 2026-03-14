import { FixedWindow } from "@limitkit/core";
import { RedisCompatible } from "../types";

export class RedisFixedWindow extends FixedWindow implements RedisCompatible {
  luaScript: string = `
    local key = KEYS[1]

    local now = tonumber(ARGV[1])
    local window = tonumber(ARGV[2])
    local limit = tonumber(ARGV[3])
    local cost = tonumber(ARGV[4])

    local state = redis.call("HMGET", key, "start", "count")
    local windowStart = tonumber(state[1])
    local count = tonumber(state[2])

    if not windowStart then
      windowStart = now - (now % window)
      count = 0
    end

    local isStillInCurrentWindow = now - windowStart < window
    local hasExceededLimit = count + cost > limit
    if isStillInCurrentWindow and hasExceededLimit then
      local reset = windowStart + window
      local retryAfter = math.max(0, math.ceil((reset - now) / 1000))
      return {0, 0, reset, retryAfter} -- {allowed, remaining, reset, retryAfter}
    end

    if not isStillInCurrentWindow then
      windowStart = now - (now % window)
      count = 0
    end

    count = count + cost

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
