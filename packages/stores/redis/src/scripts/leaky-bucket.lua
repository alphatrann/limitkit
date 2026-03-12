-- Leaky Bucket Rate Limiting Algorithm (Redis Lua Script)
--
-- Implements a leaky bucket metaphor where requests fill the bucket
-- and data leaks out at a constant rate. Ensures consistent output rate
-- and can reject bursty requests if the bucket is full.
--
-- Algorithm:
-- 1. Calculate how much has leaked since last request based on elapsed time
-- 2. Queue size = (previous_size - leaked_amount, minimum 0)
-- 3. Check if adding the new request would overflow the bucket
-- 4. If overflow, reject with retry-after based on overflow
-- 5. If accepted, increment queue size and update last leak time
-- 6. Calculate reset based on time for all queued items to leak
--
-- Data Structure (Redis Hash):
--   Key: rate_limit_key
--   Fields:
--     lastLeak: Unix timestamp of last leak calculation (ms)
--     size: Current queue size (items)
--
-- KEYS:
--   key - The rate limit key (e.g., user ID, IP address)
--
-- ARGV:
--   [1] now      - Current timestamp in milliseconds
--   [2] leakRate - Items leaking per second (constant output rate)
--   [3] capacity - Maximum bucket capacity (items)
--   [4] cost     - Size of incoming request (items to add to queue)
--
-- Returns:
--   {allowed, remaining, reset, retryAfter}
--   - allowed: 1 if accepted, 0 if bucket full
--   - remaining: Available capacity (items that can be queued)
--   - reset: Unix timestamp when all queued items drain (ms)
--   - retryAfter: Seconds to wait before retrying if denied (0 if allowed)

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