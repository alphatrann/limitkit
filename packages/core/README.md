# 📦 `@limitkit/core`

[![npm version](https://img.shields.io/npm/v/@limitkit/core)](https://www.npmjs.com/package/@limitkit/core)
[![downloads](https://img.shields.io/npm/dw/@limitkit/core)](https://www.npmjs.com/package/@limitkit/core)
[![license](https://img.shields.io/npm/l/@limitkit/core)](https://github.com/alphatrann/limitkit/blob/main/LICENSE)

**The core rate limiting engine for LimitKit.**

`@limitkit/core` evaluates **rules and policies** to decide whether a request should be allowed or rejected.
It is **store-agnostic** and works with multiple storage backends in any context.

Apart from traditional REST APIs, it can also be adopted in any context such as GraphQL, WebSockets, job queues.

---

## 🔌 Integrations

The core engine integrates seamlessly with other LimitKit packages:

| Package             | Purpose                         |
| ------------------- | ------------------------------- |
| [`@limitkit/memory`](https://www.npmjs.com/package/@limitkit/memory)  | In-memory store for development |
| [`@limitkit/redis`](https://www.npmjs.com/package/@limitkit/redis)   | Distributed rate limiting with Redis      |
| [`@limitkit/express`](https://www.npmjs.com/package/@limitkit/express) | Express.js middleware           |
| [`@limitkit/nest`](https://www.npmjs.com/package/@limitkit/nest)    | NestJS guards & decorators      |

---

## ⚡ Installation

```bash
npm install @limitkit/core
```

---

## ⚡ Quick Start

Simply have a `limiter` instance where you define all the rules, configure store and debug (optional).

Then, call `limiter.consume`, which returns an object containing `allowed` that indicates whether the request is allowed or rejected.

```ts
import { RateLimiter } from "@limitkit/core";
import { InMemoryStore, fixedWindow } from "@limitkit/memory";

const limiter = new RateLimiter({
  store: new InMemoryStore(),

  rules: [
    {
      name: "global",
      key: "global",
      policy: fixedWindow({ window: 60, limit: 100 }),
    },
  ],
});

const result = await limiter.consume(ctx);

if (!result.allowed) {
  console.log("Rate limited");
}
```


The `rules` array in the `limiter` object are evaluated in order **from first to last**.

Once the **first failure** is found, the remaining rules are not evaluated.

---

## 🏗 Architecture

The engine follows a simple pipeline:

```
request
  ↓
rules
  ↓
key resolution
  ↓
policy evaluation
  ↓
store update
  ↓
decision
```

Each rule:

1. resolves a **key** (who is being limited)
2. selects a **policy** (how to limit)
3. consumes quota from the **store**
4. returns allow / reject

---

## 🧩 Rule Definition

A rule in LimitKit consists of these main properties:

```ts
{
  name: "user",
  key: (ctx) => "acc:" + ctx.user.id,
  policy: tokenBucket(...),
  cost: 1
}
```

| Field    | Description                                           |
| -------- | ----------------------------------------------------- |
| `name`   | rule identifier (ensure it is unique in a set of layers)     |
| `key`    | groups requests (string, function, or async function) |
| `policy` | rate limiting algorithm (can be resolved dynamically) |
| `cost`   | weight per request (default `1`)                      |

---

## 🧠 Dynamic Policies

Policies can be resolved dynamically per request:

```ts
policy: (ctx) => {
  return ctx.user.plan === "pro"
    ? proPolicy
    : freePolicy;
}
```

This is particularly useful when you want to enforce:

* SaaS plan limits
* per-endpoint limits
* feature-based quotas

---

## 🎯 Examples

Here are some common examples in LimitKit:

### Layered Limits

As a rule of thumb, rules are evaluated from global scope to user scope.

If any rule fails, the evaluation stops and the request is rejected.

```ts
rules: [
  { name: "global", key: "global", policy: globalPolicy },
  { name: "ip", key: (ctx) => "ip:" + ctx.ip, policy: ipPolicy },
  { name: "user", key: (ctx) => "acc:" + ctx.user.id, policy: userPolicy },
]
```

---

### SaaS Plans

This example introduces dynamic strategies depending on the user's subscription plans.

The `policy` can be an async function in which you can query the database or cache, but it may increase latency.

```ts
{
  key: (ctx) => "acc:" + ctx.user.id,
  policy: (ctx) => {
    return ctx.user.plan === "pro"
      ? proPolicy
      : freePolicy;
  }
}
```

---

### Expensive Operations

Sometimes, it's more convenient to add weights to requests instead of restricting the number of requests.

In the snippet below, assuming the `/report` endpoint performs expensive computations, `cost` represents the weight of the resources needed to handle a request. Thus, a request to `/report` consumes 10x more tokens than other endpoints, which triggers rate limits faster to mitigate abuse.

```ts
{
  key: (ctx) => "acc:" + ctx.user.id,
  cost: (ctx) => ctx.endpoint === "/report" ? 10 : 1,
  policy: tokenBucketPolicy
}
```

---

## 📊 Result

`consume(context)` returns a normalized result represented as `RateLimitResult` interface:

```ts
interface RateLimitResult {
  allowed: boolean;
  failedAt: string | null;
  rules: IdentifiedRateLimitRuleResult[]
}
```

| Field        | Meaning                            |
| ------------ | ---------------------------------- |
| `allowed`    | request permitted or blocked       |
| `failedAt`   | the name of the rule failed, `null` if every rule passes |
| `rules`      | an array containing the results of all evaluated rules |

The result of each evaluated rule is represented as `IdentifiedRateLimitRuleResult` interface:

```ts
interface IdentifiedRateLimitRuleResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  availableAt?: number;
}
```

| Field        | Meaning                            |
| ------------ | ---------------------------------- |
| `allowed`    | request permitted or blocked by the rule      |
| `limit`   | the maximum number of requests allowed by the rule |
| `remaining`      | the remaining number of requests allowed by the rule |
| `resetAt`      | the Unix timestamp (ms) after which the limit for the rule fully resets |
| `availableAt`      | the Unix timestamp (ms) after which the request is allowed by the rule. |