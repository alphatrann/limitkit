import { TokenBucket } from "@limitkit/core";
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
export class RedisTokenBucket extends TokenBucket implements RedisCompatible {
  luaScript: string = `
    local key = KEYS[1]

    local now = tonumber(ARGV[1])
    local refillRate = tonumber(ARGV[2])
    local capacity = tonumber(ARGV[3])
    local cost = tonumber(ARGV[4])

    local state = redis.call("HMGET", key, "lastRefill", "tokens")
    local lastRefill = tonumber(state[1])
    local tokens = tonumber(state[2])

    if not lastRefill or not tokens then
      lastRefill = now
      tokens = capacity
    end

    local elapsedSeconds = (now - lastRefill) / 1000
    tokens = math.min(capacity, tokens + elapsedSeconds * refillRate)
    lastRefill = now
    if tokens < cost then
      local tokensNeeded = cost - tokens
      local retryMs = (tokensNeeded / refillRate) * 1000

      local retryAfter = math.max(0, math.ceil(retryMs / 1000)) -- in seconds
      local reset = now + ((capacity - tokens) / refillRate) * 1000
      return {0, 0, reset, retryAfter}
    end

    tokens = tokens - cost

    redis.call("HSET", key, "lastRefill", lastRefill, "tokens", tokens)
    redis.call("PEXPIRE", key, math.ceil((capacity / refillRate) * 1000))

    local reset = now + ((capacity - tokens) / refillRate) * 1000
    return {1, tokens, reset, 0}
  `;

  get limit(): number {
    return this.config.capacity;
  }

  getLuaArgs(now: number, cost: number): string[] {
    return [
      now.toString(),
      this.config.refillRate.toString(),
      this.config.capacity.toString(),
      cost.toString(),
    ];
  }
}
