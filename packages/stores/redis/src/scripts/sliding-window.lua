-- Sliding Window Rate Limiting Algorithm (Redis Lua Script)
--
-- Implements a sliding window rate limiter using a sorted set to track
-- individual request timestamps. Provides precise rate limiting without
-- the boundary issues of fixed windows.
--
-- Algorithm:
-- 1. Remove all requests older than the current window
-- 2. Count remaining requests in the window
-- 3. If count + cost exceeds limit, reject with retry-after
-- 4. Otherwise, add the current request timestamp and allow
-- 5. Record when the oldest request in the window will expire as reset time
--
-- Data Structure (Redis Sorted Set):
--   Key: rate_limit_key
--   Scores: Request timestamps (milliseconds)
--   Members: Unique identifiers for each request in the window
--
-- KEYS:
--   key - The rate limit key (e.g., user ID, IP address)
--
-- ARGV:
--   [1] now      - Current timestamp in milliseconds
--   [2] window   - Window size in milliseconds
--   [3] limit    - Maximum requests allowed in the sliding window
--   [4] cost     - Number of requests to consume
--
-- Returns:
--   {allowed, remaining, reset, retryAfter}
--   - allowed: 1 if request allowed, 0 if denied
--   - remaining: Available slots in current window
--   - reset: Unix timestamp when oldest request expires (ms)
--   - retryAfter: Seconds to wait before retrying (0 if allowed)

local key = KEYS[1]

local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])

-- remove expired entries
redis.call("ZREMRANGEBYSCORE", key, "-inf", now - window)

local size = redis.call("ZCARD", key)

-- reject
if size + cost > limit then
  local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")

  if #oldest == 0 then
    return {0, limit, now, 0}
  end

  local oldestTime = tonumber(oldest[2])
  local reset = oldestTime + window
  local retryAfter = math.max(0, math.ceil((reset - now) / 1000))

  return {0, 0, reset, retryAfter}
end

-- allow
for i = 1, cost do
  local member = now .. "-" .. i
  redis.call("ZADD", key, now, member)
end

redis.call("PEXPIRE", key, window)

local remaining = limit - (size + cost)

local newest = redis.call("ZRANGE", key, -1, -1, "WITHSCORES")
local reset = now + window

if #newest > 0 then
  reset = tonumber(newest[2]) + window
end

return {1, remaining, reset, 0}