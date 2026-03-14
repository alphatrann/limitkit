import { LeakyBucket } from "@limitkit/core";
import { RedisCompatible } from "../types";

/**
 * Redis implementation of the Token Bucket rate limiting algorithm.
 *
 * Token Bucket allows bursts of requests while enforcing a sustained rate
 * limit over time.
 *
 * ## Algorithm
 *
 * A bucket contains tokens representing available request capacity.
 *
 * - Tokens refill continuously at a fixed rate
 * - Requests consume tokens
 * - Requests are rejected when insufficient tokens are available
 *
 * ## Redis State
 *
 * State is stored in a Redis hash:
 *
 * ```text
 * key
 * ├─ lastRefill → timestamp of last refill
 * └─ tokens     → current token count
 * ```
 *
 * The bucket refills proportionally based on the time elapsed since the
 * last request.
 *
 * ## Atomic Execution
 *
 * All rate limiting logic executes inside Redis using Lua, ensuring
 * atomic updates and preventing race conditions across distributed
 * clients.
 *
 * ## Lua Arguments
 *
 * ```text
 * KEYS[1] → rate limit key
 *
 * ARGV[1] → current timestamp (ms)
 * ARGV[2] → refill rate (tokens/sec)
 * ARGV[3] → capacity
 * ARGV[4] → cost
 * ```
 *
 * ## Script Return Value
 *
 * ```text
 * {allowed, remaining, reset, retryAfter}
 * ```
 *
 * - `remaining` represents remaining tokens in the bucket.
 *
 * @see TokenBucket
 * @see RedisStore
 */
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
