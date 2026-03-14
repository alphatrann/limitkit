# LimitKit

A flexible, algorithm-agnostic rate limiting toolkit for Node.js with first-class support for **Express**, **NestJS**, and **Redis**.

LimitKit separates **algorithms**, **storage**, and **framework integrations**, allowing you to build scalable and customizable rate limiting systems.

---

## Overview

LimitKit provides a modular rate limiting system designed for modern backend applications.

Key design goals:

- Flexible algorithm implementations
- Pluggable storage backends
- Framework-agnostic core
- Framework adapters for Express and NestJS
- Redis support with atomic Lua scripts
- RFC-compliant RateLimit headers

---

## Features

- Multiple rate limiting algorithms
- Distributed rate limiting via Redis
- In-memory store for simple deployments
- Express middleware
- NestJS module + decorators
- Dynamic rule evaluation
- Cost-based request accounting
- Atomic Redis execution with Lua scripts


---

## Table of Contents

- [Installation](#installation)
- [Basic Usage](#basic-usage)
- [Express Example](#express-example)
- [NestJS Example](#nestjs-example)
- [Algorithms](#algorithms)
- [Stores](#stores)
- [Custom Algorithms](#custom-algorithms)
- [Custom Stores](#custom-stores)
- [Architecture](#architecture)
- [Contributing](#contributing)
- [Roadmap](#roadmap)
- [License](#license)

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

# Basic Usage

```ts
import { RateLimiter } from "@limitkit/core"
import { InMemoryStore, InMemoryFixedWindow } from "@limitkit/memory"

const limiter = new RateLimiter({
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
```

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

Route-level override:

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

---

# Algorithms

LimitKit supports multiple rate limiting algorithms.

| Algorithm              | Description                                        |
| ---------------------- | -------------------------------------------------- |
| Fixed Window           | Counts requests in discrete time windows           |
| Sliding Window         | Smooth request rate across time                    |
| Sliding Window Counter | Approximate sliding window using two counters      |
| Token Bucket           | Allows bursts while maintaining average rate       |
| Leaky Bucket           | Smooths traffic into a constant outflow rate       |
| GCRA                   | Precise request scheduling used by telecom systems |

---

# Stores

Stores control **where rate limit state is stored**.

| Store         | Description               |
| ------------- | ------------------------- |
| InMemoryStore | Fast local memory storage |
| RedisStore    | Distributed rate limiting |

Example Redis usage:

```ts
import { RedisStore } from "@limitkit/redis"
import { createClient } from "redis"

const redis = createClient()
await redis.connect()

const store = new RedisStore(redis)
```

---

# Custom Algorithms

LimitKit allows you to create your own rate limiting algorithms.

Custom algorithms must implement the `Algorithm` interface.

Example:

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

If your algorithm supports in-memory execution, implement the `InMemoryCompatible<TState>` interface.

```ts
class MyInMemoryAlgorithm implements Algorithm<MyConfig>, InMemoryCompatible<MyState> {
  process(state: MyState | undefined, now: number, cost: number=1): { state: MyState; output: RateLimitResult } {
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

If your algorithm supports Redis execution, implement the `RedisCompatible` interface.

```ts
class MyRedisAlgorithm implements Algorithm<MyConfig>, RedisCompatible {

  luaScript = `
    -- Redis Lua logic
  `

  getLuaArgs(now: number, cost: number) {
    return [now.toString(), cost.toString()]
  }
}
```

---

# Custom Stores

Stores are responsible for executing algorithms and persisting state.

You can create your own store by implementing the `Store` interface.

Example:

```ts
import { Store } from "@limitkit/core"

class MyStore implements Store {

  async consume(key, algorithm, now, cost) {
    // custom logic
  }

}
```

This allows integration with systems like:

* DynamoDB
* PostgreSQL
* Cloudflare KV
* MongoDB

---

# Architecture

LimitKit separates rate limiting into three layers:
```
Application
     ↓
RateLimiter
     ↓
   Store
     ↓
Algorithm
```
This separation allows algorithms and storage backends to evolve independently.


---

# Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md) to know how to contribute to LimitKit

---

# Roadmap

Future improvements:

* Sliding log algorithm
* Fastify adapter
* Hono adapter
* Observability / metrics support
* Rate limit dashboards

---

# License

MIT License