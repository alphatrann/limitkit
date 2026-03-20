# 📦 `@limitkit/memory`

[![npm version](https://img.shields.io/npm/v/@limitkit/memory)](https://www.npmjs.com/package/@limitkit/memory)
[![downloads](https://img.shields.io/npm/dw/@limitkit/memory)](https://www.npmjs.com/package/@limitkit/memory)
[![license](https://img.shields.io/npm/l/@limitkit/memory)](https://github.com/alphatrann/limitkit/blob/main/LICENSE)

**In-memory store and built-in rate limiting policies for LimitKit.**

⚠ `@limitkit/memory` is only best suited for:

* ✅ Local development
* ✅ Testing environments
* ✅ Single-instance applications
* ✅ Prototyping and evaluation

Because all state is stored **in-process**, it does **not scale across multiple instances**.

> For production and distributed systems, consider using Redis via [`@limitkit/redis`](https://www.npmjs.com/package/@limitkit/redis).



## ⚡ Installation

```bash
npm install @limitkit/core @limitkit/memory
```


## ⚡ Quick Start

Set `store: new InMemoryStore()`
```ts
import { RateLimiter } from "@limitkit/core";
import { InMemoryStore, fixedWindow } from "@limitkit/memory";

const limiter = new RateLimiter({
  store: new InMemoryStore(),

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

* All rate limiting data is stored **in memory**.
* Each process maintains its own counters, so there are no shared states across processes.
* There are no network calls, thus the latency is **very low (sub-ms)**
* The states are cleared if the application restarts.

```
process memory → policy → decision
```


## ⚙️ Algorithms

`@limitkit/memory` includes optimized implementations of common rate limiting strategies.

You have to ensure all the policies use the algorithm functions below from `@limitkit/memory`

```ts
import { fixedWindow } from "@limitkit/memory";
```

#### Fixed Window

```ts
fixedWindow({ window: 60, limit: 100 })
```



#### Sliding Window

```ts
slidingWindow({ window: 60, limit: 100 })
```



#### Sliding Window Counter

```ts
slidingWindowCounter({ window: 60, limit: 100 })
```



#### Token Bucket

```ts
tokenBucket({ capacity: 100, refillRate: 5 })
```



#### Leaky Bucket

```ts
leakyBucket({ capacity: 100, leakRate: 5 })
```



#### GCRA (Generalized Cell Rate Algorithm)

```ts
gcra({ burst: 5, interval: 1 })
```