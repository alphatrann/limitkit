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