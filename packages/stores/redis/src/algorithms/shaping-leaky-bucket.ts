import { LeakyBucket } from "@limitkit/core";
import { RedisCompatible } from "../types";

/**
 * Redis implementation of the **Shaping Leaky Bucket** algorithm.
 *
 * This variant is intended for **traffic shaping** rather than strict HTTP rate limiting.
 * Requests are queued and scheduled based on a constant leak rate (`leakRate`).
 * Requests may be delayed (`availableAt`) instead of being rejected immediately.
 *
 * ## Use Cases
 * - Worker queues
 * - Sending outbound requests
 * - Handling backpressure
 * - Downstream systems cannot tolerate bursts
 *
 * ## Redis State
 *
 * State is stored in a Redis hash:
 * ```
 * key
 * └─ nextFreeAt → timestamp (ms) when the next request may execute
 * ```
 *
 * ## Usage
 * ```ts
 * import { createClient } from "redis";
 * import { RedisStore, RedisShapingLeakyBucket } from "@limitkit/redis";
 *
 * const redis = createClient();
 * await redis.connect();
 *
 * const shaper = new RedisShapingLeakyBucket({
 *    name: "leaky-bucket",
 *    capacity: 100,
 *    leakRate: 2 // requests per second
 * })
 * const redisStore = new RedisStore(redis);
 *
 * const result = await redisStore.consume(key, shaper, Date.now(), 1);
 * // schedule execution based on `availableAt`
 * setTimeout(() => handleJob(), result.availableAt - Date.now());
 * ```
 *
 * ## Atomic Execution
 *
 * Logic is executed atomically using Lua scripts to prevent race conditions
 * across multiple clients or server instances.
 *
 * ## Lua Arguments
 * ```
 * KEYS[1] → rate limit key
 * ARGV[1] → current timestamp (ms)
 * ARGV[2] → leak rate (tokens/sec)
 * ARGV[3] → capacity
 * ARGV[4] → cost
 * ```
 *
 * ## Script Return Value
 * ```
 * {allowed, remaining, reset, availableAt}
 * ```
 * - `allowed` – 1 if the request fits in the bucket
 * - `remaining` – number of free slots in the queue
 * - `reset` – timestamp (ms) when the bucket will be empty
 * - `availableAt` – earliest timestamp (ms) when this request may execute
 *
 * @extends LeakyBucket
 * @implements RedisCompatible
 */
export class RedisShapingLeakyBucket
  extends LeakyBucket
  implements RedisCompatible
{
  luaScript: string = `
    local key = KEYS[1]

    local now = tonumber(ARGV[1])
    local leakRate = tonumber(ARGV[2])
    local capacity = tonumber(ARGV[3])
    local cost = tonumber(ARGV[4])

    local state = redis.call("HGET", key, "nextFreeAt")
    local nextFreeAt = tonumber(state) or now

    if nextFreeAt < now then
      nextFreeAt = now
    end

    local delay = nextFreeAt - now
    local queueSize = delay * (leakRate / 1000)

    if queueSize + cost > capacity then
      local reset = now + math.ceil(queueSize / leakRate * 1000)
      return {0, 0, reset, nextFreeAt}
    end

    nextFreeAt = nextFreeAt + math.ceil(cost / leakRate * 1000)

    redis.call("HSET", key, "nextFreeAt", nextFreeAt)
    redis.call("PEXPIRE", key, math.ceil(capacity / leakRate * 1000))

    queueSize = queueSize + cost

    local remaining = math.max(0, math.floor(capacity - queueSize))
    local reset = now + math.ceil(queueSize / leakRate * 1000)

    return {1, remaining, reset, nextFreeAt}
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
