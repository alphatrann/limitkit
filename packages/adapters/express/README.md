# @limitkit/express

Express middleware for **LimitKit**.

👉 Main project: https://github.com/alphatrann/limitkit

---

## Installation

```bash
npm install @limitkit/express
````

You will also need a store package:

```bash
npm install @limitkit/memory
```

---

## Basic Usage

```ts
import express from "express"
import { limit } from "@limitkit/express"
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

const app = express()

app.get("/api", limit(limiter), (req, res) => {
  res.json({ message: "Hello world" })
})
```

---

## Route-Level Configuration

Route-specific rules can override global rules.

```ts
app.post(
  "/login",
  limit(limiter, {
    rules: [
      {
        name: "login",
        key: (req) => req.ip,
        policy: new InMemoryFixedWindow({
          name: "fixed-window",
          window: 60,
          limit: 5
        })
      }
    ]
  }),
  loginHandler
)
```

---

## Response Headers

The middleware automatically sets standard rate limit headers:

* `RateLimit-Limit`
* `RateLimit-Remaining`
* `RateLimit-Reset`
* `Retry-After` (when limit exceeded)
