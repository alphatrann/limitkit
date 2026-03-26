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

#### Shaping Leaky Bucket

Shaping leaky bucket is a special algorithm that is typically used in worker queues to handle backpressure by delaying operations.

Simply create a store, a traffic shaper and call `store.consume` with the shaper. The result contains `availableAt`, which tells when to execute this job.

This reduces backpressure when producers enqueue too many tasks while consumers can't handle them fast enough.

```ts
import { createClient } from "redis";
import { RedisStore, shapingLeakyBucket } from "@limitkit/redis";

const redis = createClient();
await redis.connect();

const shaper = shapingLeakyBucket({
   capacity: 100,
   leakRate: 2 // requests per second
})

const redisStore = new RedisStore(redis);

// somewhere in code
const now = Date.now()
const result = await redisStore.consume(key, shaper, now, 1);
// schedule execution based on `availableAt`
setTimeout(() => handleJob(), result.availableAt - now);
```

Alternatively, you can still create a `limiter` and call `consume`:

```ts
import { RateLimiter } from "@limitkit/core";
import { InMemoryStore, shapingLeakyBucket } from "@limitkit/memory";

const redis = createClient();
await redis.connect();

const limiter = new RateLimiter({
  store: new RedisStore(redis),
  rules: [
    {
      name: "queue",
      key: (ctx) => ctx.queue.name, // handle backpressure for all the job queues
      policy: shapingLeakyBucket({
        capacity: 200,
        leakRate: 4,
      }),
    },
  ],
});

// somewhere in code
const result = await limiter.consume(ctx);
setTimeout(() => handleJob(), result.rules[0].availableAt - now);
```

---

#### GCRA

```ts
gcra({ burst: 5, interval: 1 })
```