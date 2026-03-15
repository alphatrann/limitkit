

# LimitKit

## Table of Contents

- [Why LimitKit](#why-limitkit)
- [Key Features](#key-features)
- [Installation](#installation)
- [Quick Start](#quick-start)

- [What You Can Build With LimitKit](#what-you-can-build-with-limitkit)
  - [Weighted Requests](#weighted-requests)
  - [SaaS Plan Quotas](#saas-plan-quotas)
  - [Layered Rate Limits](#layered-rate-limits)
  - [GraphQL and Other Contexts](#graphql-and-other-contexts)
  - [Rate Limiting Background Jobs](#rate-limiting-background-jobs)

- [Express Example](#express-example)
- [NestJS Example](#nestjs-example)
- [Other Node.js Frameworks Integration](#other-nodejs-frameworks-integration)

- [Algorithms](#algorithms)
- [Stores](#stores)
- [Store Compatibility](#store-compatibility)

- [Architecture](#architecture)
- [Comparison](#comparison)
- [Advanced Usage](#advanced-usage)
  - [Custom Algorithms](#custom-algorithms)
  - [Custom Stores](#custom-stores)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

**Flexible, policy-driven rate limiting for Node.js applications.**

LimitKit is a modular rate limiting engine designed not just for APIs. It can support **APIs, GraphQL services, WebSockets, and background workloads**.

Unlike traditional middleware-based limiters, LimitKit separates **algorithms**, **storage**, and **application policies**, allowing developers to build scalable and customizable rate limiting systems.

---

# Why LimitKit?

Many Node.js rate limiting libraries focus on **simple request counters**, typically implemented as middleware protecting HTTP endpoints.

This approach works well for basic API protection but becomes limiting when applications require more advanced policies such as:

* SaaS plan quotas
* multi-tenant limits
* weighted operations
* distributed rate limiting
* limits outside HTTP (GraphQL, WebSockets, background jobs)

LimitKit treats rate limiting as **application policy**, not just middleware protection.

Its architecture separates:

```
policy → algorithm → storage
```

This allows developers to model complex limits without coupling them to a specific framework or infrastructure.

---

# Key Features

## Multiple Rate Limiting Algorithms

LimitKit supports several algorithms suitable for different workloads:

* Fixed Window
* Sliding Window
* Sliding Window Counter
* Token Bucket
* Leaky Bucket
* GCRA

---

## Framework-Agnostic Core

The core engine can be used in any context:

* REST APIs
* GraphQL resolvers
* WebSocket events
* background workers
* queue processors
* internal services

Adapters are provided for:

* Express
* NestJS

You can integrate LimitKit into other frameworks by using the core engine.

---

## Distributed Rate Limiting

LimitKit supports distributed deployments via Redis.

Redis execution uses **atomic Lua scripts** to prevent race conditions under concurrency.

---

## Dynamic Policies

Policies can be evaluated at runtime.

Examples include:

* SaaS subscription tiers
* user-specific quotas
* time-based limits
* system load based throttling

---

## Weighted Requests

Different operations can consume different amounts of rate limit budget.

Example:

| Operation             | Cost |
| --------------------- | ---- |
| GET /posts            | 1    |
| POST /generate-report | 10   |

This allows expensive operations to be limited more aggressively.

---

## Multiple Limits

Applications can define layered policies such as:

```
Global API limit
      ↓
Per-IP limit
      ↓
Per-user limit
      ↓
Per-endpoint limit
```

---

# Installation

Install the core package:

```bash
npm install @limitkit/core
```

Optional adapters:

```bash
npm install @limitkit/express
npm install @limitkit/nest
npm install @limitkit/memory
npm install @limitkit/redis
```

---

# Quick Start

Create a simple rate limiter using in-memory storage.

```ts
import { RateLimiter } from "@limitkit/core"
import { InMemoryStore, InMemoryFixedWindow } from "@limitkit/memory"

const limiter = new RateLimiter({
  store: new InMemoryStore(),
  rules: [
    {
      name: "global",
      key: (ctx) => ctx.ip,
      policy: new InMemoryFixedWindow({
        name: "fixed-window",
        window: 60,
        limit: 100
      })
    }
  ]
})
```

Consume a request:

```ts
const result = await limiter.consume(ctx)

if (!result.allowed) {
  throw new Error("Rate limit exceeded")
}
```

---

# What You Can Build With LimitKit

LimitKit is designed for **policy-driven rate limiting**, not just request counting.

Below are some examples of policies that can be implemented using LimitKit.

---

## Weighted Requests

Different operations can consume different amounts of rate limit budget.

This is useful when some endpoints are significantly more expensive than others.

```ts
const limiter = new RateLimiter({
  store: new RedisStore(redis),
  rules: [
    {
      name: "api-cost",
      key: (ctx) => ctx.user.id,

      cost: (ctx) => {
        if (ctx.route === "/generate-report") return 10
        if (ctx.route === "/export-data") return 5
        return 1
      },

      policy: {
        name: "token-bucket",
        capacity: 100,
        refillRate: 10
      }
    }
  ]
})
```

This allows expensive operations to be limited more aggressively.

---

## SaaS Plan Quotas

Rate limits can be computed dynamically based on user attributes.

```ts
const limiter = new RateLimiter({
  rules: [
    {
      name: "user-plan",
      key: (ctx) => ctx.user.id,

      policy: (ctx) => {
        if (ctx.user.plan === "free")
          return { name: "token-bucket", capacity: 50, refillRate: 1 }

        if (ctx.user.plan === "pro")
          return { name: "token-bucket", capacity: 500, refillRate: 10 }
      }
    }
  ]
})
```

This enables **plan-based quotas for multi-tenant applications**.

---

## Layered Rate Limits

Multiple policies can be applied simultaneously.

```ts
const limiter = new RateLimiter({
  rules: [
    {
      name: "global",
      key: () => "global",
      policy: { name: "token-bucket", capacity: 10000, refillRate: 500 }
    },
    {
      name: "ip",
      key: (ctx) => ctx.ip,
      policy: { name: "token-bucket", capacity: 100, refillRate: 5 }
    },
    {
      name: "user",
      key: (ctx) => ctx.user.id,
      policy: { name: "token-bucket", capacity: 1000, refillRate: 50 }
    }
  ]
})
```

This provides layered protection such as:

```
global limit
   ↓
IP limit
   ↓
user quota
```

---

## GraphQL and Other Contexts

Apart from REST APIs, LimitKit can be used in other contexts such as GraphQL or WebSockets.

```ts
const limiter = new RateLimiter({
  store: new RedisStore(redis),
  rules: [
    {
      name: "graphql-user",
      key: (ctx) => ctx.user.id,
      policy: {
        name: "token-bucket",
        capacity: 100,
        refillRate: 5
      }
    }
  ]
})

async function resolvePosts(ctx) {
  const result = await limiter.consume(ctx)

  if (!result.allowed) {
    throw new Error("Rate limit exceeded")
  }

  return getPosts()
}
```

---

## Rate Limiting Background Jobs

LimitKit can be used outside HTTP servers.

Example: limiting job processing per user.

```ts
async function processJob(job) {

  const result = await limiter.consume(`job:${job.type}`, { cost: job.weight })

  if (!result.allowed)
    throw new Error("User quota exceeded")

  await generateReport(job)
}
```

Because the core engine is framework-agnostic, it can be used in:

* REST APIs
* GraphQL resolvers
* WebSocket systems
* job workers
* queue processors

---

# Express Example

```ts
import express from "express"
import { limit } from "@limitkit/express"

const app = express()

app.get("/api", limit(limiter), (req, res) => {
  res.json({ message: "Hello world" })
})
```

---

# NestJS Example

```ts
@Module({
  imports: [
    LimitModule.forRoot({
      store: new InMemoryStore(),
      rules: [
        {
          name: "global",
          key: (req) => req.ip,
          policy: new InMemoryFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 100
          })
        }
      ]
    })
  ]
})
export class AppModule {}
```

Route-level overrides:

```ts
@RateLimit({
  rules: [
    {
      name: "login",
      key: (req) => req.ip,
      policy: new RedisFixedWindow({
        name: "fixed-window",
        window: 60,
        limit: 5
      })
    }
  ]
})
@Post("/login")
login() {}
```

# Other Node.js Frameworks Integration

Although LimitKit hasn't supported integration with other Node.js frameworks yet, you simply create a global `RateLimiter` instance and call `.consume` to perform rate limit checks.

```typescript
import { limiter } from "./limiter"

fastify.addHook("onRequest", async (req, reply) => {
  const result = await limiter.consume(req)

  if (!result.allowed) {
    reply.code(429).send({ error: "Too Many Requests" })
  }
})
```

---

# Example: SaaS Rate Limiting

LimitKit makes it easy to implement plan-based quotas.

```ts
const limiter = new RateLimiter({
  rules: [
    {
      name: "user-plan",
      key: (ctx) => ctx.user.id,
      policy: (ctx) => {
        if (ctx.user.plan === "free")
          return { name: "token-bucket", capacity: 50, refillRate: 1 }

        if (ctx.user.plan === "pro")
          return { name: "token-bucket", capacity: 500, refillRate: 10 }
      }
    },
    {
      name: "endpoint-cost",
      key: (ctx) => ctx.user.id,
      cost: (ctx) => ctx.route === "/generate-report" ? 10 : 1,
      policy: { name: "token-bucket", capacity: 100, refillRate: 5 }
    }
  ]
})
```

This enables:

* plan-based quotas
* weighted operations
* per-user limits

---

# Algorithms

| Algorithm              | Description                                     |
| ---------------------- | ----------------------------------------------- |
| Fixed Window           | Simple counters within discrete time windows    |
| Sliding Window         | Smooth rate control                             |
| Sliding Window Counter | Approximate sliding window with lower overhead  |
| Token Bucket           | Allows bursts while maintaining average rate    |
| Leaky Bucket           | Smooths traffic into a constant flow            |
| GCRA                   | Precise rate scheduling used in telecom systems |

Custom algorithms can be implemented by following [the guides](#custom-algorithms).

---

# Stores

Stores control **where rate limit state is stored**.

| Store         | Description               |
| ------------- | ------------------------- |
| InMemoryStore | Fast local storage        |
| RedisStore    | Distributed rate limiting |

Example Redis setup:

```ts
import { RedisStore } from "@limitkit/redis"
import { createClient } from "redis"

const redis = createClient()
await redis.connect()

const store = new RedisStore(redis)
```

---

# Store Compatibility

Rate limiting algorithms require **atomic state updates** to prevent race conditions.

Different storage systems provide different atomic primitives:

| Store  | Atomic mechanism     |
| ------ | -------------------- |
| Memory | synchronous mutation |
| Redis  | Lua scripts          |
| SQL    | transactions         |
| NoSQL  | conditional writes   |

Because of this, some algorithms may require **store-specific implementations**.

LimitKit provides reference implementations for:

* in-memory execution
* Redis execution

Custom stores can implement algorithms using their storage system's native atomic capabilities.

---

# Architecture

LimitKit separates rate limiting into independent layers:

```
Application (HTTP / GraphQL / WS / Jobs)
            ↓
        RateLimiter
            ↓
           Store
            ↓
         Algorithm
```

This architecture allows algorithms and storage systems to evolve independently.

---

# Comparison

LimitKit focuses on **policy-driven rate limiting**, while many libraries focus on **HTTP request counting or infrastructure protection**.

| Feature                   | LimitKit | express-rate-limit | rate-limiter-flexible |
| ------------------------- | -------- | ------------------ | --------------------- |
| Multiple algorithms       | ✅        | ❌                  | ❌                     |
| Framework-agnostic core   | ✅        | ❌                  | ⚠️                    |
| Distributed rate limiting | ✅        | ⚠️                 | ✅                     |
| Policy-based rules        | ✅        | ❌                  | ⚠️                    |
| Weighted requests         | ✅        | ❌                  | ❌                     |
| Express integration       | ✅        | ✅                  | ⚠️                    |
| NestJS integration        | ✅        | ❌                  | ⚠️                    |

Legend:

* ✅ built-in
* ⚠️ possible but indirect
* ❌ not supported


---

# Advanced Usage

LimitKit is designed to be **fully extensible**.
You can implement your own **rate limiting algorithms** and **storage backends** to support custom infrastructures.

---

## Custom Algorithms

LimitKit allows you to implement your own rate limiting algorithms.

All algorithms must implement the `Algorithm` interface.

```ts
import { Algorithm } from "@limitkit/core"

class MyAlgorithm implements Algorithm<MyConfig> {

  constructor(public config: MyConfig) {}

  validate() {
    if (this.config.limit <= 0) {
      throw new Error("Invalid config")
    }
  }

}
```

Algorithms can support different execution environments depending on the interfaces they implement.

---

### In-Memory Algorithms

Algorithms that run in memory should implement the `InMemoryCompatible` interface.

```ts
class MyInMemoryAlgorithm
  implements Algorithm<MyConfig>, InMemoryCompatible<MyState> {

  process(
    state: MyState | undefined,
    now: number,
    cost: number = 1
  ): { state: MyState; output: RateLimitResult } {

    return {
      state,
      output: {
        allowed: true,
        remaining: 100,
        reset: 1700000000
      }
    }
  }

}
```

This allows the algorithm to execute entirely in application memory.

---

### Redis Algorithms

Algorithms that support Redis must implement the `RedisCompatible` interface.

Redis algorithms execute **atomically using Lua scripts** to avoid race conditions in distributed systems.

```ts
class MyRedisAlgorithm
  implements Algorithm<MyConfig>, RedisCompatible {

  luaScript = `
    -- Redis Lua logic
  `

  getLuaArgs(now: number, cost: number) {
    return [now.toString(), cost.toString()]
  }

}
```

---

## Custom Stores

Stores are responsible for **persisting rate limit state and executing algorithms**.

To implement a custom store, implement the `Store` interface.

```ts
import { Store } from "@limitkit/core"

class MyStore implements Store {

  async consume(key, algorithm, now, cost) {
    // custom persistence logic
  }

}
```

Custom stores allow LimitKit to integrate with many backend systems.

Examples include:

* DynamoDB
* PostgreSQL
* MongoDB
* Cloudflare KV
* Cassandra
* custom internal infrastructure

However, LimitKit keeps **algorithm logic inside the store execution layer**.

This means that when implementing a custom store, the store must execute the algorithm **atomically within the storage system**.

For example:

* Redis uses **Lua scripts**
* PostgreSQL may require **transactions or SQL procedures**
* DynamoDB may require **conditional writes**

Because each storage system has different atomicity guarantees, **algorithms must be implemented for that store environment**.

Suppose you wanted to support fixed window with PostgreSQL, you have to implement both `PostgresFixedWindow` and `PostgresStore`:

```ts
interface PostgresCompatible {
  readonly tx: Transaction;

  execute(): Promise<void>;
}

class PostgresFixedWindow extends FixedWindow implements PostgresCompatible {
  // implement fixed window in a Postgres transaction here
}

class PostgresStore implements Store {
  private prisma: PrismaClient; // assume Prisma is used

  async consume<TConfig extends AlgorithmConfig>(
    key: string,
    algorithm: Algorithm<TConfig> & PostgresCompatible,
    now: number,
    cost: number = 1,
  ): Promise<RateLimitResult> {
    await this.prisma.$transaction(async (tx) => {
      // remaining code...
      await algorithm.execute(tx);
    })
  }
}
```

This approach ensures:

* atomic updates
* no race conditions
* safe distributed execution

---

# Roadmap

Planned improvements:

* Sliding Log algorithm
* Fastify adapter
* Hono adapter
* observability and metrics
* rate limit dashboards
* OpenTelemetry integration

---

# Contributing

Contributions are welcome.

Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines.

---

# License

MIT License