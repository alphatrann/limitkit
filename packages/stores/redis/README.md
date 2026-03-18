# 📦 `@limitkit/redis`

[![npm version](https://img.shields.io/npm/v/@limitkit/redis)](https://www.npmjs.com/package/@limitkit/redis)
[![downloads](https://img.shields.io/npm/dw/@limitkit/redis)](https://www.npmjs.com/package/@limitkit/redis)
[![license](https://img.shields.io/npm/l/@limitkit/redis)](https://github.com/alphatrann/limitkit/blob/main/LICENSE)

**Redis-backed store and algorithms for distributed rate limiting.**

Use this in production for consistent limits across multiple instances.

Works seamlessly with `@limitkit/core`.

---

# ⚡ Quick Start

```bash
npm install @limitkit/redis redis
```

```ts
import { RateLimiter } from "@limitkit/core";
import { RedisStore, RedisFixedWindow } from "@limitkit/redis";
import { createClient } from "redis";

const client = createClient();
await client.connect();

const limiter = new RateLimiter({
  store: new RedisStore(client),
  rules: [
    {
      name: "global",
      key: "global",
      policy: new RedisFixedWindow({
        window: 60,
        limit: 100,
      }),
    },
  ],
});
```

---

# 🧩 What’s Included

## Store

```ts
new RedisStore(client)
```

Shared across all instances using Redis.

---

## Algorithms

All core strategies are available:

### Fixed Window

```ts
new RedisFixedWindow({ window: 60, limit: 100 })
```

### Sliding Window

```ts
new RedisSlidingWindow({ window: 60, limit: 100 })
```

### Sliding Window Counter

```ts
new RedisSlidingWindowCounter({ window: 60, limit: 100 })
```

### Token Bucket

```ts
new RedisTokenBucket({ capacity: 100, refillRate: 5 })
```

### Leaky Bucket

```ts
new RedisLeakyBucket({ capacity: 100, leakRate: 5 })
```

### GCRA

```ts
new RedisGCRA({ burst: 5, interval: 1 })
```

---

# 🎯 When to Use

* Multiple servers / instances
* Kubernetes or serverless environments
* Global or shared rate limits
* Horizontal scaling

---

# ⚖️ Why Redis

Without a shared store:

```
instance A → limit = 100
instance B → limit = 100
```

→ user effectively gets **200 requests**

With Redis:

```
shared store → limit = 100 total
```

→ consistent enforcement across all instances

---

# ⚠️ Considerations

* Requires a running Redis instance
* Adds network latency (typically minimal)
* Ensure proper connection handling

---

# 🏁 Summary

* Distributed rate limiting
* Consistent limits across instances
* Production-ready scaling