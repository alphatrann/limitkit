import { GCRA } from "@limitkit/core";
import { RedisCompatible } from "../types";

/**
 * Redis implementation of the GCRA (Generic Cell Rate Algorithm).
 *
 * GCRA is a mathematically precise rate limiting algorithm widely used
 * in telecom and networking systems. It enforces request spacing using
 * a concept called the **Theoretical Arrival Time (TAT)**.
 *
 * ## Algorithm
 *
 * Each request updates the theoretical arrival time:
 *
 * ```text
 * TAT = max(now, TAT) + interval
 * ```
 *
 * A request is allowed if it arrives after the calculated allowance time,
 * which incorporates burst tolerance.
 *
 * ## Redis State
 *
 * The algorithm stores a single value:
 *
 * ```text
 * key → theoretical arrival time (TAT)
 * ```
 *
 * This value determines when the next request is allowed.
 *
 * ## Atomic Execution
 *
 * The rate limit calculation is executed inside Redis via Lua, ensuring
 * atomic updates and correctness in distributed environments.
 *
 * ## Lua Arguments
 *
 * ```text
 * KEYS[1] → rate limit key
 *
 * ARGV[1] → current timestamp (ms)
 * ARGV[2] → interval between requests (ms)
 * ARGV[3] → burst size
 * ARGV[4] → cost
 * ```
 *
 * ## Script Return Value
 *
 * ```text
 * {allowed, remaining, reset, retryAfter}
 * ```
 *
 * - `reset` represents the next theoretical arrival time.
 *
 * @see GCRA
 * @see RedisStore
 */
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
