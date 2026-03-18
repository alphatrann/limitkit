# LimitKit Express Adapter

[![npm version](https://img.shields.io/npm/v/@limitkit/express)](https://www.npmjs.com/package/@limitkit/express)
[![downloads](https://img.shields.io/npm/dw/@limitkit/express)](https://www.npmjs.com/package/@limitkit/express)
[![license](https://img.shields.io/npm/l/@limitkit/express)](https://github.com/alphatrann/limitkit/blob/main/LICENSE)

**Rate limiting for Express using LimitKit’s policy-driven engine.**

This package provides a flexible middleware that lets you define **layered, dynamic, and cost-based rate limits** — not just simple per-IP throttling.


---

# ⚡ Quick Start

Install:

```bash
npm install @limitkit/express @limitkit/core @limitkit/memory
```

---

## Basic Setup

```ts
import express from "express";
import { RateLimiter } from "@limitkit/core";
import { limit } from "@limitkit/express";
import { InMemoryStore, InMemoryFixedWindow } from "@limitkit/memory";

const app = express();

const limiter = new RateLimiter({
  store: new InMemoryStore(),
  rules: [
    {
      name: "global",
      key: (req) => req.ip,
      policy: new InMemoryFixedWindow({
        name: "fixed-window",
        window: 60,
        limit: 100,
      }),
    },
  ],
});

app.get("/", limit(limiter), (req, res) => {
  res.json({ ok: true });
});

app.listen(3000);
```

👉 Your app is now rate-limited.

---

# 🧠 How It Works

* `limit(limiter)` returns Express middleware
* Each request is passed into the `RateLimiter`
* Rules are evaluated in order (top → bottom)

---

# 🎯 Common Usage

## Per-user rate limiting

```ts
{
  name: "user",
  key: (req) => req.headers["user-id"],
  policy: new InMemoryFixedWindow({
    window: 60,
    limit: 1000,
    name: "fixed-window",
  }),
}
```

Each user gets their own quota.

---

## Layered limits

```ts
const limiter = new RateLimiter({
  store: new InMemoryStore(),
  rules: [
    { name: "global", key: () => "global", policy: ... },
    { name: "ip", key: (req) => req.ip, policy: ... },
    { name: "user", key: (req) => req.user.id, policy: ... },
  ],
});
```

Evaluation order:

```
global → ip → user
```

---

## 🎛 Route-Level Overrides

Override or extend rules per route:

```ts
app.get(
  "/api",
  limit(limiter, {
    rules: [
      {
        name: "api",
        key: (req) => req.headers["user-id"],
        policy: new InMemoryFixedWindow({
          window: 60,
          limit: 50,
          name: "fixed-window",
        }),
      },
    ],
  }),
  (req, res) => {
    res.json({ ok: true });
  }
);
```

---

### 🧠 Merge Behavior

Route-level rules are merged with global rules by `name`:

* If a rule with the **same `name` exists**, it is **overridden**
* If the `name` is **new**, it is **appended**

---

### Example

Global:

```ts
const limiter = new RateLimiter({
  rules: [
    { name: "global", key: "global", policy: ... },
    { name: "user", key: (req) => req.user.id, policy: ... },
  ],
  store,
});
```

Route:

```ts
limit(limiter, {
  rules: [
    { name: "user", key: (req) => req.user.id, policy: stricterPolicy },
    { name: "route", key: "route", policy: ... },
  ],
});
```

Result:

```ts
[
  { name: "global", ... }, // unchanged
  { name: "user", ... },   // overridden by route rule
  { name: "route", ... },  // appended
]
```

---

### ✅ Why this matters

* tighten limits per route without redefining everything
* reuse global structure
* avoid duplicate or conflicting rules

---

# ⚖️ Weighted Requests

```ts
{
  key: (req) => req.user.id,
  cost: (req) => req.path === "/generate-report" ? 10 : 1,
  policy: new InMemoryTokenBucket({
    capacity: 100,
    refillRate: 5,
    name: "token-bucket",
  }),
}
```

Expensive endpoints consume more quota.

---

# 🏢 Dynamic Policies (SaaS Plans)

```ts
{
  key: (req) => req.user.id,
  policy: (req) => {
    if (req.user.plan === "free")
      return new InMemoryTokenBucket({ capacity: 50, refillRate: 1 });

    if (req.user.plan === "pro")
      return new InMemoryTokenBucket({ capacity: 500, refillRate: 10 });
  },
}
```

Define limits based on business logic.

---

# 📡 Headers

LimitKit automatically sets standard rate limit headers:

```
RateLimit-Limit
RateLimit-Remaining
RateLimit-Reset
Retry-After (when blocked)
```

Example:

```
RateLimit-Limit: 100
RateLimit-Remaining: 99
RateLimit-Reset: 10
```

---

# 🧩 Features

* Middleware-based integration
* Layered rule evaluation
* Route-level overrides
* Weighted requests (cost)
* Dynamic runtime policies
* Works with all LimitKit stores and algorithms

---

# 🏁 Summary

LimitKit for Express gives you:

* **drop-in middleware**
* **fine-grained control per route**
* **policy-driven flexibility beyond simple throttling**