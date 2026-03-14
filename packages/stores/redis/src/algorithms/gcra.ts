import { GCRA } from "@limitkit/core";
import { RedisCompatible } from "../types";

export class RedisGCRA extends GCRA implements RedisCompatible {
  luaScript: string = `
    local key = KEYS[1]

    local now = tonumber(ARGV[1])
    local interval = tonumber(ARGV[2])
    local burst = tonumber(ARGV[3])
    local cost = tonumber(ARGV[4])

    local state = redis.call("GET", key)
    local tat = tonumber(state)

    if not tat then
      tat = now
    end

    local burstTolerance = (burst - 1) * interval
    local allowAt = tat - burstTolerance + (cost - 1) * interval

    if now < allowAt then
      local retryAfter = math.max(0, math.ceil((allowAt - now) / 1000))
      return {0, 0, tat, retryAfter}
    end

    tat = math.max(now, tat) + cost * interval
    local backlog = tat - now
    local remaining = math.max(0, math.floor((burstTolerance - backlog) / interval) + 1)

    redis.call("SET", key, tat, "PX", burst * interval)
    return {1, remaining, tat, 0}
  `;

  get limit(): number {
    return this.config.burst;
  }

  getLuaArgs(now: number, cost: number): string[] {
    return [
      now.toString(),
      (this.config.interval * 1000).toString(),
      this.config.burst.toString(),
      cost.toString(),
    ];
  }
}
