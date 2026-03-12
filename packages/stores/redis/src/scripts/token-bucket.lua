-- Token Bucket Rate Limiting Algorithm (Redis Lua Script)
--
-- Implements a token bucket where tokens are refilled at a constant rate.
-- Allows bursting up to the configured capacity and then throttles to the
-- refill rate. Ideal for rate limiting with burstiness control.
--
-- Algorithm:
-- 1. Calculate elapsed time since last refill
-- 2. Add refilled tokens: elapsed_seconds * refillRate (capped at capacity)
-- 3. If sufficient tokens available, consume the cost amount
-- 4. Otherwise, calculate when tokens will be available for retry
-- 5. Update last refill time and token count
--
-- Data Structure (Redis Hash):
--   Key: rate_limit_key
--   Fields:
--     lastRefill: Unix timestamp of last refill (ms)
--     tokens: Current token count (float)
--
-- KEYS:
--   key - The rate limit key (e.g., user ID, IP address)
--
-- ARGV:
--   [1] now        - Current timestamp in milliseconds
--   [2] refillRate - Tokens added per second
--   [3] capacity   - Maximum bucket capacity (tokens)
--   [4] cost       - Tokens to consume for this request
--
-- Returns:
--   {allowed, remaining, reset, retryAfter}
--   - allowed: 1 if sufficient tokens, 0 if denied
--   - remaining: Current token count (rounded down)
--   - reset: Unix timestamp when bucket refills to capacity (ms)
--   - retryAfter: Seconds to wait until cost tokens available (0 if allowed)

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