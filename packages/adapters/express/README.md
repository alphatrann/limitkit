# LimitKit Express Adapter

[![npm version](https://img.shields.io/npm/v/@limitkit/express)](https://www.npmjs.com/package/@limitkit/express)
[![downloads](https://img.shields.io/npm/dw/@limitkit/express)](https://www.npmjs.com/package/@limitkit/express)
[![license](https://img.shields.io/npm/l/@limitkit/express)](https://github.com/alphatrann/limitkit/blob/main/LICENSE)

Rate limiting for Express using LimitKit's policy-driven engine.

This package provides a middleware that:

- integrates with Express.js
- allows you to override global rules for particular routes
- returns 429 if the request is rejected
- automatically sets standard IETF rate limit headers

---

## Quick Start

Install:

```bash
npm install @limitkit/express
```

---

## Basic Setup

To start, declare a global `limiter` instance and pass it into every `limit` middleware call.

```ts
import express from 'express';
import { RateLimiter } from '@limitkit/core';
import { limit } from '@limitkit/express';
import { InMemoryStore, fixedWindow } from '@limitkit/memory';

const app = express();

const limiter = new RateLimiter({
  store: new InMemoryStore(),
  rules: [
    {
      name: 'global',
      key: (req) => 'ip:' + req.ip,
      policy: fixedWindow({
        window: 60,
        limit: 100,
      }),
    },
  ],
});

app.get('/', limit(limiter), (req, res) => {
  res.json({ ok: true });
});

app.listen(3000);
```

## Route-Level Overrides

Optionally, you can provide an object in the second argument of the `limit` middleware that lets you override or extend rules per route.

Route-level rules are merged with global rules by `name`:

- If a rule with the same `name` exists, it is overridden
- If the `name` is new, it is appended

```ts
app.get(
  '/api',
  limit(limiter, {
    rules: [
      {
        name: 'api',
        key: (req) => 'acc:' + req.user.id,
        policy: fixedWindow({
          window: 60,
          limit: 50,
        }),
      },
    ],
  }),
  (req, res) => {
    res.json({ ok: true });
  },
);
```

### Example

Given the following global rules:

```ts
const limiter = new RateLimiter({
  rules: [
    { name: "global", key: "global", policy: ... },
    { name: "user", key: (req) => "acc:" + req.user.id, policy: ... },
  ],
  store,
});
```

The route's rules start from the global rules, but the rule `"user"` is overridden by what's defined in the route, and the rule `"route"` is appended and evaluated after the `"global"` and `"user"` rules:

```ts
limit(limiter, {
  rules: [
    { name: "user", key: (req) => "acc:" + req.user.id, policy: stricterPolicy },
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

## Headers

The `limit` middleware sets two representations of the same information.

**Per-policy** — the structured fields from [draft-ietf-httpapi-ratelimit-headers](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/), with one list member per evaluated rule (nothing is lost when several limits apply):

```
RateLimit: "per-ip";r=39;t=5, "per-user";r=490;t=54221
RateLimit-Policy: "per-ip";q=100, "per-user";q=1000
```

`r` = remaining, `t` = seconds to reset, `q` = quota. The window parameter (`w`) is not emitted.

**Single-policy** — the widely-supported individual headers, derived from the one rule that binds the request first:

```
RateLimit-Limit
RateLimit-Remaining
Reset-After          # seconds until that rule fully resets
Retry-After          # only on a 429
```

Example on a rejected request:

```
RateLimit: "global";r=812;t=41, "per-ip";r=0;t=30
RateLimit-Policy: "global";q=1000, "per-ip";q=100
RateLimit-Limit: 100
RateLimit-Remaining: 0
Reset-After: 30
Retry-After: 30
```
