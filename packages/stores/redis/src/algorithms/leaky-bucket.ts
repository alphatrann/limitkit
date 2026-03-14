import { LeakyBucket } from "@limitkit/core";
import { RedisCompatible } from "../types";

export class RedisLeakyBucket extends LeakyBucket implements RedisCompatible {
  luaScript: string = `
    local key = KEYS[1]

    local now = tonumber(ARGV[1])
    local leakRate = tonumber(ARGV[2])
    local capacity = tonumber(ARGV[3])
    local cost = tonumber(ARGV[4])

    local state = redis.call("HMGET", key, "lastLeak", "size")
    local lastLeak = tonumber(state[1])
    local queueSize = tonumber(state[2])

    if not lastLeak or not queueSize then
      lastLeak = now
      queueSize = 0
    end

    local elapsedSeconds = (now - lastLeak) / 1000
    queueSize = math.max(0, queueSize - elapsedSeconds * leakRate)

    if queueSize + cost > capacity then
      local overflow = queueSize + cost - capacity
      local retryMs = (overflow / leakRate) * 1000
      local retryAfter = math.max(0, math.ceil(retryMs / 1000))
      local reset = now + (queueSize / leakRate) * 1000
      return {0, 0, reset, retryAfter}
    end

    queueSize = queueSize + cost
    lastLeak = now

    redis.call("HSET", key, "lastLeak", lastLeak, "size", queueSize)
    redis.call("PEXPIRE", key, math.ceil((capacity / leakRate) * 1000))

    local reset = now + (queueSize / leakRate) * 1000
    local remaining = math.max(0, math.floor(capacity - queueSize))

    return {1, remaining, reset, 0}
  `;

  get limit(): number {
    return this.config.capacity;
  }

  getLuaArgs(now: number, cost: number): string[] {
    return [
      now.toString(),
      this.config.leakRate.toString(),
      this.config.capacity.toString(),
      cost.toString(),
    ];
  }
}
