-- GCRA (Generic Cell Rate Algorithm) Rate Limiting (Redis Lua Script)
--
-- Implements GCRA (also known as "Leaky Bucket as a Meter"), a sophisticated
-- rate limiting algorithm that allows bursts while maintaining a strict average rate.
-- Commonly used by APIs and telecom systems.
--
-- Algorithm:
-- 1. Track TAT (Theoretical Arrival Time) of the next allowed request
-- 2. Calculate maximum burst tolerance: (burst - 1) * interval
-- 3. Allow current request if: now >= (TAT - burst_tolerance)
-- 4. Update TAT for next request: max(now, TAT) + cost * interval
-- 5. Calculate remaining capacity based on how far into burst we are
--
-- Key Concepts:
--   - Interval: Time between individual units (minimum spacing)
--   - Burst: Maximum count of units allowed in a burst
--   - Burst Tolerance: How far back we can go to allow a burst
--   - TAT: Virtual time when next request can be served
--
-- Example: burst=3, interval=1000ms
--   Can allow 3 requests immediately, then must space out at 1 per second
--
-- KEYS:
--   key - The rate limit key (e.g., user ID, IP address)
--
-- ARGV:
--   [1] now      - Current timestamp in milliseconds
--   [2] interval - Time between units in milliseconds (minimum request spacing)
--   [3] burst    - Maximum units allowed in a burst
--   [4] cost     - Units being consumed by this request
--
-- Returns:
--   {allowed, remaining, reset, retryAfter}
--   - allowed: 1 if within rate limit, 0 if exceeds rate
--   - remaining: Units remaining before next burst limit reached
--   - reset: Theoretical Arrival Time (ms) - when the meter fully resets
--   - retryAfter: Seconds to wait for next available burst slot (0 if allowed)

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
local allowAt = tat - burstTolerance

if now < allowAt then
  local retryAfter = math.max(0, math.ceil((allowAt - now) / 1000))
  return {0, 0, tat, retryAfter}
end

tat = math.max(now, tat) + cost * interval
local backlog = tat - now
local remaining = math.max(0, math.floor((burstTolerance - backlog) / interval) + 1)

redis.call("SET", key, tat, "PX", burst * interval)
return {1, remaining, tat, 0}