-- Fixed Window Rate Limiting Algorithm (Redis Lua Script)
--
-- Implements a fixed-window rate limiter that divides time into fixed intervals
-- and allows a maximum number of requests per window. Simple but can have issues
-- at window boundaries (thundering herd problem).
--
-- Algorithm:
-- 1. Calculate the current window start time (aligned to window boundaries)
-- 2. Check if we're still in the same window as the previous request
-- 3. If in same window and at limit, reject the request
-- 4. If entering a new window, reset the counter
-- 5. Increment the counter and allow the request
--
-- KEYS:
--   key - The rate limit key (e.g., user ID, IP address)
--
-- ARGV:
--   [1] now      - Current timestamp in milliseconds
--   [2] window   - Window size in milliseconds
--   [3] limit    - Maximum requests allowed per window
--   [4] cost     - Cost of this request (tokens to consume)
--
-- Returns:
--   {allowed, remaining, reset, retryAfter}
--   - allowed: 1 if request allowed, 0 if denied
--   - remaining: Available tokens in current window
--   - reset: Unix timestamp when window resets (ms)
--   - retryAfter: Seconds to wait before retrying (0 if allowed)

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