
# @limitkit/memory

In-memory store for **LimitKit**.

Suitable for single-instance deployments, development environments, or testing.

👉 Main project: https://github.com/alphatrann/limitkit

---

## Installation

```bash
npm install @limitkit/memory
````

---

## Usage

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

## When to Use

The in-memory store is best suited for:

* development
* local testing
* single-instance deployments

For distributed environments, consider using `@limitkit/redis`.