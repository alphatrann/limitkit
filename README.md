# LimitKit

**A schema-based approach to rate limiting for Node.js.**

Rate limiting starts simple — until your application grows.

What begins as a single global limit often turns into a mix of:
- per-IP limits
- per-user limits
- plan-based rules (free vs pro)
- endpoint-specific costs
- dynamic conditions based on context

At that point, rate limiting stops being a simple middleware — and becomes a system.

LimitKit helps you design that system declaratively.

Instead of scattering logic across middleware and conditionals, you define your rules in one place — and let LimitKit handle the orchestration.


## 📄 Table of Contents

* [🚀 Why LimitKit?](#-why-limitkit)
* [📦 Installation](#-installation)
* [⚡ Quick Example](#-quick-example)
* [🧠 How it works](#-how-it-works)
* [🧩 Core Concepts](#-core-concepts)
* [🧠 Policies](#-policies)
* [🎯 Real-World Example](#-real-world-example)
* [⚙️ Packages](#️-packages)
* [🧑‍💻 Common Recipes](#-common-recipes)
* [🤝 Contributing](#-contributing)
* [⚖️️ Comparisons](#️-comparisons)
* [📄 License](#-license)

---

## 🚀 Why LimitKit?

### Problems

Suppose your rate limiting started with something simple like this:

```ts
app.use(async (req, res, next) => {
  try {
    await globalLimiter.consume("global");
    await ipLimiter.consume("ip:" + req.ip);
  } catch (error) {
    return res.status(429).json({ message: "Too many requests" })
  }

  next();
});
```

Then your app grows. You need extra protection layers:

* global + per-IP + per-user limits
* free vs pro plans
* stricter rules for expensive endpoints
* rate limiting by time of day, CPU usage

And your logic ends up like this:

```ts
app.use(async (req, res, next) => {
  try {
    await globalLimiter.consume("global");
    await ipLimiter.consume("ip:" + req.ip);

    if (req.user) {
      if (req.user.plan === "pro") {
        await proLimiter.consume("acc:" + req.user.id);
      } else {
        await freeLimiter.consume("acc:" + req.user.id);
      }

      if (req.path.includes("export")) {
        await exportLimiter.consume("acc:" + req.user.id);
      }
    }
  } catch (error) {
    return res.status(429).json({ message: "Too many requests" })
  }


  next();
});
```

It works — but some problems begin to arise:

* Every new rule means adding another limiter instance
* Logic gets buried in nested conditionals
* Small changes require touching multiple places
* Different endpoints start duplicating similar logic
* It’s hard to see what the actual limits are at a glance

Imagine your client wanted:

> Export should cost 10x more for free users only.

You then added another nested conditional:

```ts
if (req.path.includes("export")) {
  if (req.user.plan === "pro") {
    await exportLimiter.consume("acc:" + req.user.id, 1);
  } else {
    await exportLimiter.consume("acc:" + req.user.id, 10);
  }
}
```

Now your client wants another endpoint which needs slightly different behavior.

You either duplicate this logic — or make this middleware even more complex.

---

### A different approach

Instead of spreading logic across middleware, define your rules in one place:

```ts
const limiter = new RateLimiter({
  store,
  rules: [
    {
      name: "global",
      key: "global",
      policy: fixedWindow({ window: 1, limit: 1000 }),
    },
    {
      name: "ip",
      key: (req) => "ip:" + req.ip,
      policy: fixedWindow({ window: 1, limit: 500 }),
    },
    {
      name: "user-plan",
      key: (req) => "acc:" + req.user.id,
      policy: (req) =>
        req.user.plan === "pro"
          ? slidingWindow({ window: 60, limit: 1000 })
          : slidingWindow({ window: 60, limit: 100 }),
    },
    {
      name: "costly",
      key: (req) => "acc:" + req.user.id,
      cost: (req) =>
        req.path.includes("export")
          ? req.user.plan === "pro" ? 1 : 10
          : 1,
      policy: tokenBucket({ capacity: 100, refillRate: 5 }),
    },
  ],
});
```

Then your middleware becomes:

```ts
app.use(async (req, res, next) => {
  const result = await limiter.consume(req);

  if (!result.allowed) {
    return res.status(429).json({ message: "Too many requests" });
  }

  next();
});
```

These are what LimitKit is trying to achieve:

* All rules are defined in one place
* No nested conditionals in middleware
* No duplicated logic across endpoints
* Adding a new rule doesn’t require touching existing ones

You stop thinking in "how do I structure this middleware?" with nested if-else statements
and start thinking in "what are my rules?"

---

## 📦 Installation

To get started, install:
* `@limitkit/core`: the core library of LimitKit
* `@limitkit/memory`: LimitKit's in-memory rate limiting support:

```bash
npm install @limitkit/core @limitkit/memory
```

You can explore all supported packages in the [Packages](#️-packages) section.

---

## ⚡ Quick Example

Let's start with a minimal code example to know how LimitKit works.

Simply copy-paste the snippets below in order into a JavaScript/TypeScript file

### Import necessary packages

CommonJS:
```js
const { RateLimiter } = require("@limitkit/core");
const { slidingWindow, InMemoryStore } = require("@limitkit/memory");
```

ESM:
```ts
import { RateLimiter } from "@limitkit/core";
import { slidingWindow, InMemoryStore } from "@limitkit/memory";
```

### Instantiate a rate limiter

```ts
const limiter = new RateLimiter({
  store: new InMemoryStore(),
  rules: [
    {
      name: "global-limit",
      key: "global",
      policy: slidingWindow({ window: 10, limit: 1000 }),
    },
    {
      name: "ip-limit",
      key: (ctx) => "ip:" + ctx.ip,
      cost: (ctx) => ctx.isPriority ? 5 : 1,
      policy: slidingWindow({ window: 60, limit: 60 }),
    },
  ],
});
```

### Testing
```ts
async function sendRequests(n) {
  let allowed = 0;
  for (let i = 0; i < n; i++) {
    const res = await limiter.consume({ ip: "127.0.0.1", isPriority: true });
    if (res.allowed) allowed++;

    // Uncomment to inspect behavior
    // console.log(res.failedRule, res.rules);
  }

  return allowed;
}

const NUMBER_OF_REQUESTS = 100;

sendRequests(NUMBER_OF_REQUESTS)
  .then((allowed) => {
    console.log(`Allowed: ${allowed}/${NUMBER_OF_REQUESTS}; rejected: ${NUMBER_OF_REQUESTS - allowed}/${NUMBER_OF_REQUESTS}`)
  })

```

Execute the file with Node.js, which should output:
```
Allowed: 12/100; rejected: 88/100
```

> Best practice: Add a unique prefix in front of the key such as `ip:` to distinguish among global, IP and account.

---

## 🧠 How it works

```
Request → Rules → Key → Policy → Store → Decision
```

Each rule:

1. Generates a key to identify who to limit
2. Resolves a policy statically or dynamically
3. Consumes from the store atomically
4. Indicates whether the request is allowed or rejected.

Rules are evaluated **sequentially**.

The request is allowed only if all rules pass.

If there's a failed rule, the remaining rules won't be evaluated.

---

## 🧩 Core Concepts

### Rule

A rule in LimitKit consists of 4 properties:

```ts
{ name, key, policy, cost? }
```

* `name` (string, required): rate limit identifier, which is useful when you want to know which rule fails. To avoid confusion, ensure it's globally unique in a set of rules.
* `key` (string, required): rate limit target, which can be IP, account or a single global key. It can be a static or dynamic value returned from a function.
* `policy` (required): rate limit strategy applied to the `key`, which can be static or dynamic. See all the supported algorithms in the [Policies](#-policies) section.
* `cost` (number, optional): weight per request (default: 1), which is a more convenient way of limiting compared to lowering the number of requests. For example, requests hitting resource-intensive endpoints should have higher costs. Likewise, `cost` can be static or dynamic.

---

## 🧠 Policies

Different strategies produce different behavior.

LimitKit supports common algorithms that fit most of the basic use cases.

These algorithms are functions imported from store-specific libraries such as `@limitkit/memory`.

Please ensure that the `store` used and the algorithm functions below are imported from **the same library**.

### Fixed Window

```ts
fixedWindow({ window: 60, limit: 100 })
```

### Sliding Window

```ts
slidingWindow({ window: 60, limit: 100 })
```

### Sliding Window Counter

```ts
slidingWindowCounter({ window: 60, limit: 100 })
```

### Token Bucket

```ts
tokenBucket({ capacity: 100, refillRate: 5 })
```

### Leaky Bucket

```ts
leakyBucket({ capacity: 100, leakRate: 5 })
```

### GCRA (Generic Cell Rate Algorithm)

```ts
gcra({ burst: 5, interval: 1 })
```

---

## 🎯 Real-World Example

In real applications, different contexts have different shapes. For example, in public routes, `req.user` may be `undefined`, whereas in authenticated routes, `req.user` always exists and you want to enforce rate limiting per account here.

Trying to handle both in a single limiter usually leads to writing messy conditionals.

Instead of one long list of rules, separate them into contexts:

```ts
const globalRules = [
  {
    name: "global",
    key: "global",
    policy: fixedWindow({ window: 1, limit: 1000 }),
  },
  {
    name: "ip",
    key: (req) => "ip:" + req.ip,
    policy: fixedWindow({ window: 5, limit: 500 }),
  }
]

const authenticatedRules = [
  // Per-user limits
  {
    name: "user",
    key: (req) => "acc:" + req.user.id,
    policy: slidingWindow({ window: 60, limit: 100 }),
  },

  // Expensive endpoints
  {
    name: "costly",
    key: (req) => "acc:" + req.user.id,
    cost: (req) => (req.path.includes("export") ? 10 : 1),
    policy: tokenBucket({ refillRate: 5, capacity: 100 }),
  },

  // SaaS plan-based limits
  {
    name: "plan",
    key: (req) => "acc:" + req.user.id,
    policy: (req) =>
      req.user.plan === "pro" ?
        gcra({ burst: 1000, interval: 30 }) :
        gcra({ burst: 100, interval: 60 }),
  },
]

const globalLimiter = new RateLimiter({
  store,
  rules: globalRules
})

const authenticatedLimiter = new RateLimiter({
  store,
  rules: [...globalRules, ...authenticatedRules],
});
```

Now, public routes use `globalLimiter` while authenticated routes combine both `globalLimiter` and `authenticatedLimiter`, the same `globalRules` are reused without duplication. Looking at the code, it's easier to see exactly what applies — without tracing middleware or conditionals.

---

## ⚙️ Packages

LimitKit currently supports five main packages:

| Package             | Role                         | Category    | Status      |
| ------------------- | ---------------------------- | ----------- | ----------- |
| [`@limitkit/core`](./packages/core/README.md)    | Orchestration engine         | Core        | Required    |
| [`@limitkit/redis`](./packages/stores/redis/README.md)   | Redis-backed atomic policies | Storage     | Production  |
| [`@limitkit/memory`](./packages/stores/memory/README.md)  | In-memory policies           | Storage     | Development |
| [`@limitkit/express`](./packages/adapters/express/README.md) | Express middleware           | Adapter     | Optional    |
| [`@limitkit/nest`](./packages/adapters/nest/README.md)    | NestJS guard and decorators  | Adapter     | Optional    |

---

## 🧑‍💻 Common Recipes

Here are some common patterns you'll use:

### 🔐 Login Protection

The code below enforces rate limit by IP, which mitigates brute-force attacks on the login endpoint.

```ts
{ key: (req) => "ip:" + req.ip, policy: slidingWindow({ window: 60, limit: 5 }) }
```

### 💸 Expensive Endpoints

The code below enforces rate limit by account. This assumes the `user` has been injected into the request when authenticating them.

The `cost` is dynamically resolved by the endpoint. Assume the `/generate` endpoint performs heavy computations, each request consumes more tokens, ultimately throttles earlier than other endpoints.

```ts
{
  key: (req) => "acc:" + req.user.id,
  cost: (req) => req.path === "/generate" ? 10 : 1,
  policy: tokenBucket({ refillRate: 5, capacity: 1000 })
}
```

### 🏢 SaaS Plans

The code below enforces dynamic rate limit based on user's subscription plan.

In this case, the `policy` is dynamically resolved by the user's plan. For instance, if the user's plan is `"pro"`, they will have higher limits than free users.

> Replace `proPolicy` and `freePolicy` with actual policies.

```ts
{
  key: (ctx) => "acc:" + ctx.user.id,
  policy: (ctx) => ctx.user.plan === "pro" ? proPolicy : freePolicy
}
```

---

## ⚖️ Comparisons

Libraries like [`express-rate-limit`](https://github.com/express-rate-limit/express-rate-limit) and [`rate-limiter-flexible`](https://github.com/animir/node-rate-limiter-flexible) provide fast, reliable primitives for rate limiting.

They are great when your rules are simple and static.

As your application grows, rate limiting often depends on multiple overlapping factors that are hard to manage with conditionals at scale. That's what LimitKit was built to solve.

---

## 🤝 Contributing

Contributions are welcome.

Please read [`CONTRIBUTING.md`](./CONTRIBUTING.md) for development guidelines.

---

## 📄 License

MIT