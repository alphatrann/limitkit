# 📦 `@limitkit/redis`

[![npm version](https://img.shields.io/npm/v/@limitkit/redis)](https://www.npmjs.com/package/@limitkit/redis)
[![downloads](https://img.shields.io/npm/dw/@limitkit/redis)](https://www.npmjs.com/package/@limitkit/redis)
[![license](https://img.shields.io/npm/l/@limitkit/redis)](https://github.com/alphatrann/limitkit/blob/main/LICENSE)

**Redis-backed store and atomic rate limiting policies for LimitKit.**

Designed for **distributed systems**, where multiple instances must share consistent rate limiting state.

Each request executes **atomic Lua scripts**, which avoids race conditions and ensures correctness even under high concurrency.

---

## ⚡ Installation

```bash
npm install @limitkit/core @limitkit/redis redis
```

---

## ⚡ Quick Start

```ts
import { RateLimiter } from "@limitkit/core";
import { RedisStore, fixedWindow } from "@limitkit/redis";
import { createClient } from "redis";

const client = createClient();
await client.connect();

const limiter = new RateLimiter({
  store: new RedisStore(client),

  rules: [
    {
      name: "global",
      key: "global",
      policy: fixedWindow({
        window: 60,
        limit: 100,
      }),
    },
  ],
});

await limiter.consume(ctx);
```

---

## 🧠 How it works

Node.js applications send Lua scripts to Redis, which executes them atomically.

The execution result implies whether the request should be allowed or rejected.

```
app instances → script → Redis → decision
```

---

## 🧩 What’s Included

### 🗄 Store

Create and pass a Redis client:

```ts
import { createClient } from "redis";

const client = createClient({
  url: "redis://localhost:6379", // set this in a .env file
});

await client.connect();

new RedisStore(client);
```

TypeScript may complain about the type mismatch. If needed, explicitly set the type of `client` to `RedisClientType`:

```ts
import { RedisClientType } from "redis";

const client: RedisClientType = createClient();
```

---

### ⚙️ Policies

`@limitkit/redis` includes optimized implementations of common rate limiting strategies.

You have to ensure all the policies use the algorithm functions below from `@limitkit/redis`

```ts
import { fixedWindow } from "@limitkit/redis";
```

#### Fixed Window

```ts
fixedWindow({ window: 60, limit: 100 })
```

---

#### Sliding Window

```ts
slidingWindow({ window: 60, limit: 100 })
```

---

#### Sliding Window Counter

```ts
slidingWindowCounter({ window: 60, limit: 100 })
```

---

#### Token Bucket

```ts
tokenBucket({ capacity: 100, refillRate: 5 })
```

---

#### Leaky Bucket

```ts
leakyBucket({ capacity: 100, leakRate: 5 })
```

---

#### GCRA

```ts
gcra({ burst: 5, interval: 1 })
```