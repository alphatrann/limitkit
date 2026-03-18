# LimitKit

> Define rate limits like business logic — not middleware.

LimitKit is a **policy-driven rate limiting toolkit** for Node.js.
Compose limits like:

```
global → ip → user → endpoint
```

---

# ⚡ Quick Example

```ts
import { RateLimiter } from "@limitkit/core";
import { InMemoryStore, InMemoryFixedWindow } from "@limitkit/memory";

const limiter = new RateLimiter({
  store: new InMemoryStore(),
  rules: [
    { name: "global", key: "global", policy: new InMemoryFixedWindow({ window: 60, limit: 100, name: "fixed-window" }) },
    { name: "ip", key: (req) => req.ip, policy: new InMemoryFixedWindow({ window: 60, limit: 1000, name: "fixed-window" }) },
  ],
});
```

👉 Rules run **top → bottom** and stop on first failure.

---

# 📦 Packages

### 🧠 Core

* [`@limitkit/core`](./packages/core/README.md)

### 🔌 Adapters

* [`@limitkit/express`](./packages/adapters/express/README.md)
* [`@limitkit/nest`](./packages/adapters/nest/README.md)

### 🗄 Stores

* [`@limitkit/memory`](./packages/stores/memory/README.md)
* [`@limitkit/redis`](./packages/stores/redis/README.md)

---

# 🚀 Quick Start (Express)

```ts
import express from "express";
import { limit } from "@limitkit/express";

const app = express();
app.get("/", limit(limiter), (req, res) => res.json({ ok: true }));
```

---

# 🧠 Core Concepts

## Rules

```ts
{ name, key, policy, cost? }
```

* **key**: who is being limited
* **policy**: how it’s limited
* **cost**: weight per request (default 1)

---

## Policies

* Fixed Window
* Sliding Window
* Sliding Window Counter
* Token Bucket
* Leaky Bucket
* GCRA

---

## Layering

Combine rules instead of one global limiter.

---

# 🎯 Common Recipes

## 🔐 Login Protection

```ts
{ key: (req) => req.ip, policy: new InMemoryFixedWindow({ window: 60, limit: 5 }) }
```

## 💸 Expensive Endpoints

```ts
{ key: (req) => req.user.id, cost: 10, policy: tokenBucket }
```

## 🏢 SaaS Plans

```ts
{ key: (ctx) => ctx.user.id, policy: (ctx) => ctx.user.plan === "pro" ? proPolicy : freePolicy }
```

---

# 🔗 Learn More

* Core concepts → `@limitkit/core`
* Express middleware → `@limitkit/express`
* NestJS integration → `@limitkit/nest`
* In-memory store → `@limitkit/memory`
* Redis (distributed) → `@limitkit/redis`

---

# 🏁 Summary

* Define limits as **rules**
* Combine them as **layers**
* Apply them via **adapters**

LimitKit lets you express:

> who can do what, how often, and at what cost

---

# 📄 License

MIT
