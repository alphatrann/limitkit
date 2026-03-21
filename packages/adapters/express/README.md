# LimitKit Express Adapter

[![npm version](https://img.shields.io/npm/v/@limitkit/express)](https://www.npmjs.com/package/@limitkit/express)
[![downloads](https://img.shields.io/npm/dw/@limitkit/express)](https://www.npmjs.com/package/@limitkit/express)
[![license](https://img.shields.io/npm/l/@limitkit/express)](https://github.com/alphatrann/limitkit/blob/main/LICENSE)

**Rate limiting for Express using LimitKit’s policy-driven engine.**

This package provides a flexible middleware that:

* ✅ integrates with Express.js seamlessly
* ✅ allows you to override global rules for particular routes
* ✅ returns 429 if the request is rejected
* ✅ automatically sets standard IETF rate limit headers

---

## ⚡ Quick Start

Install:

```bash
npm install @limitkit/express
```

---

## Basic Setup

To start, simply declare a global `limiter` instance and pass it into every `limit` middleware call.

```ts
import express from "express";
import { RateLimiter } from "@limitkit/core";
import { limit } from "@limitkit/express";
import { InMemoryStore, fixedWindow } from "@limitkit/memory";

const app = express();

const limiter = new RateLimiter({
  store: new InMemoryStore(),
  rules: [
    {
      name: "global",
      key: (req) => req.ip,
      policy: fixedWindow({
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
## 🎛 Route-Level Overrides

Optionally, you can provide an object in the second argument of the `limit` middleware that enables you to override or extend rules per route.


Route-level rules are merged with global rules by `name`:

* If a rule with the **same `name` exists**, it is **overridden**
* If the `name` is **new**, it is **appended**

```ts
app.get(
  "/api",
  limit(limiter, {
    rules: [
      {
        name: "api",
        key: (req) => req.headers["user-id"],
        policy: fixedWindow({
          window: 60,
          limit: 50,
        }),
      },
    ],
  }),
  (req, res) => {
    res.json({ ok: true });
  }
);
```

### Example

Given the following global rules:

```ts
const limiter = new RateLimiter({
  rules: [
    { name: "global", key: "global", policy: ... },
    { name: "user", key: (req) => req.user.id, policy: ... },
  ],
  store,
});
```

Route rules are global rules, but the rule `"user"` was overriden by what's defined in the route, and the rule `"route"` was appended and evaluated after `"global"` and `"user"` rules:

```ts
limit(limiter, {
  rules: [
    { name: "user", key: (req) => req.user.id, policy: stricterPolicy },
    { name: "route", key: "route", policy: ... },
  ],
});
```

The list of rules of the route is:

```ts
[
  { name: "global", ... }, // unchanged
  { name: "user", ... },   // overridden by route rule
  { name: "route", ... },  // appended
]
```

---

## 📡 Headers

The `limit` middleware also automatically sets standard IETF rate limit headers for you:

```
RateLimit-Limit
RateLimit-Remaining
Retry-After (when 429)
```

Along with that, the middleware also sets a custom header:
```
Reset-After
```
which is the seconds after which the limit fully resets.

Example:

```
RateLimit-Limit: 100
RateLimit-Remaining: 0
Reset-After: 60
Retry-After: 30
```