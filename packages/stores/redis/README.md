
# @limitkit/redis

Redis store for **LimitKit**.

Enables distributed rate limiting across multiple application instances using Redis and Lua scripts.

👉 Main project: https://github.com/alphatrann/limitkit

---

## Installation

```bash
npm install @limitkit/redis redis
````

---

## Usage

```ts
import { createClient } from "redis"
import { RedisStore, RedisFixedWindow } from "@limitkit/redis"
import { RateLimiter } from "@limitkit/core"

const redis = createClient()
await redis.connect()

const limiter = new RateLimiter({
  store: new RedisStore(redis),
  rules: [
    {
      name: "global",
      key: (req) => req.ip,
      policy: new RedisFixedWindow({
        name: "fixed-window",
        window: 60,
        limit: 100
      })
    }
  ]
})
```

---

## Features

* Distributed rate limiting
* Atomic Lua script execution
* Supports all LimitKit algorithms
* Suitable for horizontally scaled services
