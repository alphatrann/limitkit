# 📦 `@limitkit/memory`

[![npm version](https://img.shields.io/npm/v/@limitkit/memory)](https://www.npmjs.com/package/@limitkit/memory)
[![downloads](https://img.shields.io/npm/dw/@limitkit/memory)](https://www.npmjs.com/package/@limitkit/memory)
[![license](https://img.shields.io/npm/l/@limitkit/memory)](https://github.com/alphatrann/limitkit/blob/main/LICENSE)

**In-memory store and built-in algorithms for LimitKit.**

Best for development, testing, and single-instance apps.

Works seamlessly with `@limitkit/core`.

---

# ⚡ Quick Start

```bash
npm install @limitkit/memory
```

```ts
import { RateLimiter } from "@limitkit/core";
import { InMemoryStore, InMemoryFixedWindow } from "@limitkit/memory";

const limiter = new RateLimiter({
  store: new InMemoryStore(),
  rules: [
    {
      name: "global",
      key: "global",
      policy: new InMemoryFixedWindow({
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
new InMemoryStore()
```

Zero setup, runs entirely in-process.

---

## Algorithms

All core rate limiting strategies are included:

### Fixed Window

```ts
new InMemoryFixedWindow({ window: 60, limit: 100 })
```

### Sliding Window

```ts
new InMemorySlidingWindow({ window: 60, limit: 100 })
```

### Sliding Window Counter

```ts
new InMemorySlidingWindowCounter({ window: 60, limit: 100 })
```

### Token Bucket

```ts
new InMemoryTokenBucket({ capacity: 100, refillRate: 5 })
```

### Leaky Bucket

```ts
new InMemoryLeakyBucket({ capacity: 100, leakRate: 5 })
```

### GCRA

```ts
new InMemoryGCRA({ burst: 5, interval: 1 })
```
---

# 🎯 When to Use

* Local development
* Testing
* Prototyping rate limits
* Single-instance deployments

---

# ⚠️ Limitations

* Not shared across processes
* Resets on restart
* Not suitable for horizontal scaling

---

# 🏁 Summary

* Zero-config store
* Built-in algorithms
* Fast, in-process execution

Use this for development and simple deployments. For distributed systems, use a shared store like Redis.