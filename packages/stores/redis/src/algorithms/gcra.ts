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
 * {allowed, remaining, reset, availableAt}
 * ```
 *
 * Where:
 * - `allowed` – 1 if request is permitted
 * - `remaining` – remaining requests allowed
 * - `reset` – timestamp (ms) of the TAT
 * - `availableAt` – timestamp (ms) when the next request may succeed
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

    local burstTolerance = (burst - cost) * interval
    local allowAt = tat - burstTolerance

    if now < allowAt then
      return {0, 0, tat, allowAt}
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
