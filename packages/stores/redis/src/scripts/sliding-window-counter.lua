-- Sliding Window Counter Rate Limiting Algorithm (Redis Lua Script)
--
-- Implements a refined sliding window using two counters (current and previous window)
-- to smooth request rates at window boundaries. More sophisticated than fixed window
-- while being more memory-efficient than full sliding window.
--
-- Algorithm:
-- 1. Track counts for current and previous windows
-- 2. Calculate weighted average: current + (1 - progress) * previous
--    where progress = elapsed time in current window / window duration
-- 3. Compare weighted count against limit
-- 4. If allowed, increment current counter
-- 5. When moving to new window, shift previous = current and reset current
--
-- Data Structure (Redis Hash):
--   Key: rate_limit_key
--   Fields:
--     start: Unix timestamp of current window start (ms)
--     count: Request count in current window
--     prev: Request count from previous window
--
-- KEYS:
--   key - The rate limit key (e.g., user ID, IP address)
--
-- ARGV:
--   [1] now      - Current timestamp in milliseconds
--   [2] window   - Window size in milliseconds
--   [3] limit    - Maximum requests allowed per two-window period
--   [4] cost     - Number of requests to consume
--
-- Returns:
--   {allowed, remaining, reset, retryAfter}
--   - allowed: 1 if request allowed, 0 if denied
--   - remaining: Available tokens based on weighted calculation
--   - reset: Unix timestamp when both windows expire (ms)
--   - retryAfter: Seconds to wait before retrying (0 if allowed)

local key = KEYS[1]

local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2]) -- in ms
local limit = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])

local state = redis.call("HMGET", key, "start", "count", "prev");

local windowStart = tonumber(state[1])
local count = tonumber(state[2])
local prevCount = tonumber(state[3])

if not windowStart then
  windowStart = now - (now % window)
  count = 0
  prevCount = 0
end

local elapsed = now - windowStart
if elapsed >= window then
  local windowsPassed = math.floor(elapsed / window)
  if windowsPassed == 1 then
    prevCount = count
  else
    prevCount = 0
  end
  count = 0
  windowStart = windowStart + windowsPassed * window
  elapsed = now - windowStart
end

local progress = elapsed / window
local effective = count + (1 - progress) * prevCount
local reset = 2 * window + windowStart

if effective + cost > limit then
  local retryAfter = math.max(
    0,
    math.ceil((windowStart + window - now) / 1000)
  ) -- in seconds
  return {0, 0, reset, retryAfter} -- {allowed, remaining, reset, retryAfter}
end

count = count + cost
redis.call("HSET", key, "start", windowStart, "count", count, "prev", prevCount)
redis.call("PEXPIRE", key, window * 2)

local remaining = math.max(
  0,
  math.floor(limit - (effective + cost))
)

return {1, remaining, reset, 0}