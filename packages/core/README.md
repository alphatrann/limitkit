# 📦 `@limitkit/core`

[![npm version](https://img.shields.io/npm/v/@limitkit/core)](https://www.npmjs.com/package/@limitkit/core)
[![downloads](https://img.shields.io/npm/dw/@limitkit/core)](https://www.npmjs.com/package/@limitkit/core)
[![license](https://img.shields.io/npm/l/@limitkit/core)](https://github.com/alphatrann/limitkit/blob/main/LICENSE)

**A policy-driven rate limiting engine built on composable rules.**

---

# 🔌 Works With

The core engine is designed to integrate with:

* `@limitkit/memory` → in-memory store
* `@limitkit/redis` → distributed rate limiting
* `@limitkit/express` → middleware
* `@limitkit/nest` → guard + decorators


---

# ⚡ Quick Start

```bash
npm install @limitkit/core
```

```ts
import { RateLimiter } from "@limitkit/core";

const limiter = new RateLimiter({
  store,
  rules: [
    {
      name: "global",
      key: "global",
      policy: ...,
    },
  ],
});

const result = await limiter.consume(ctx);

if (!result.allowed) {
  console.log("Rate limited");
}
```

---

# 🧠 Core Idea

Most rate limiters answer:

> “How many requests per IP?”

LimitKit answers:

> **“What rules should control this request?”**

```ts
global → ip → user → endpoint
```

Rules run top → bottom and stop on first failure.

---

# 🧩 Concepts

A **rule** defines *who*, *how*, and *how much*:

```ts
{
  name: "user",
  key: (ctx) => ctx.user.id,
  policy: new TokenBucket(...),
  cost: 1
}
```

* **key** → groups requests (string, function, or async)
* **policy** → rate limiting algorithm (fixed, sliding, token bucket)
* **cost** → weight per request (default: 1)

Policies can also be dynamic:

```ts
policy: (ctx) => {
  return ctx.user.plan === "pro" ? proPolicy : freePolicy;
}
```

---

# 🎯 Examples

## Layered Limits

```ts
rules: [
  { name: "global", key: "global", policy: ... },
  { name: "ip", key: (ctx) => ctx.ip, policy: ... },
  { name: "user", key: (ctx) => ctx.user.id, policy: ... },
]
```

## SaaS Plans

```ts
{
  key: (ctx) => ctx.user.id,
  policy: (ctx) => {
    return ctx.user.plan === "pro" ? proPolicy : freePolicy;
  },
}
```

## Expensive Operations

```ts
{
  key: (ctx) => ctx.user.id,
  cost: (ctx) => ctx.endpoint === "/report" ? 10 : 1,
  policy: tokenBucket,
}
```

---

# 📊 Result

```ts
{
  allowed: boolean,
  limit: number,
  remaining: number,
  reset: number,
  retryAfter?: number
}
```

* **allowed** → request permitted or blocked
* **limit** → max allowed requests
* **remaining** → remaining quota
* **reset** → timestamp (ms) when fully reset
* **retryAfter** → seconds to wait (if blocked)

---

# 🏁 Summary

* Rule-based rate limiting
* Dynamic, context-aware policies
* Weighted requests
* Early exit for performance