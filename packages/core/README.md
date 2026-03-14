# @limitkit/core

Core rate limiting engine for **LimitKit**.

Provides the `RateLimiter`, rule system, and algorithm abstractions used by all LimitKit integrations.

👉 Main project: https://github.com/alphatrann/limitkit

---

## Installation

```bash
npm install @limitkit/core
````

---

## Basic Usage

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

## Supported Algorithms

LimitKit supports multiple rate limiting algorithms:

* Fixed Window
* Sliding Window
* Sliding Window Counter
* Token Bucket
* Leaky Bucket
* GCRA

Algorithms are provided by store-specific packages such as `@limitkit/memory` or `@limitkit/redis`.

---

## Rules

Each rule defines how a request is evaluated.

Example rule:

```ts
{
  name: "per-ip",
  key: (req) => req.ip,
  policy: new InMemoryFixedWindow({
    name: "fixed-window",
    window: 60,
    limit: 100
  })
}
```

Rules can define:

* `name` — unique rule identifier
* `key` — request key (e.g. IP or user ID)
* `policy` — rate limit algorithm

---

## Custom Algorithms

You can create custom algorithms by implementing the `Algorithm` interface.

```ts
import { Algorithm } from "@limitkit/core"

class MyAlgorithm implements Algorithm<MyConfig> {

  constructor(public readonly config: MyConfig) {}

  validate(): void {
    if (this.config.limit <= 0) {
      throw new Error("Invalid configuration")
    }
  }

}
```

---

## Custom Stores

Stores control where rate limiting state is stored.

Custom stores can implement the `Store` interface.

Example use cases:

* DynamoDB
* PostgreSQL
* MongoDB
* Cloudflare KV
