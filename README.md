# LimitKit

**Flexible, composable rate limiting for modern Node.js applications.**

Stop rewriting rate limiting logic every time your requirements change.

LimitKit is a **rate limiting engine**, not just a middleware — designed for systems that need **dynamic policies, multiple layers, and pluggable storage**.

## 📄 Table of Contents

* [🚀 Why LimitKit?](#-why-limitkit)
* [📦 Installation](#-installation)
* [⚡ Quick Example](#-quick-example)
* [🧠 How it works](#-how-it-works)
* [🧩 Core Concepts](#-core-concepts)
* [🧠 Policies](#-policies)
* [🎯 Real-World Example](#-real-world-example)
* [⚙️ Packages](#️-packages)
---

## 🚀 Why LimitKit?

Most Node.js rate limiters are:

* ❌ tied to one algorithm
* ❌ tied to one storage
* ❌ hard to evolve as your product grows

**LimitKit is different:**

* 🔄 Swap rate limiting strategies without rewriting logic
* 🧠 Define policies dynamically per request
* 🧱 Compose multiple layers of limits
* ⚖️ Assign cost/weight to requests
* 💾 Plug in different storage backends
* ⚡ Built with atomic guarantees in mind

> LimitKit is not just a limiter — it's a **rate limiting engine**.

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

```ts
import { RateLimiter } from "@limitkit/core";
import { fixedWindow, InMemoryStore } from "@limitkit/memory";

const limiter = new RateLimiter({
  store: new InMemoryStore(),
  rules: [
    {
      name: "ip-limit",
      key: (req) => "ip:" + req.ip,
      policy: fixedWindow({ window: 60, limit: 100 }),
    },
  ],
});

// somewhere in code
const result = await limiter.consume(req);

if (!result.allowed) {
  throw new TooManyRequestsException();
}
```

> Best practice: Add a prefix in front of the key such as `ip:` to distinguish among global, IP and account.

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

LimitKit supports common rate limiting strategies.

All the functions below can be imported from store libraries such as `@limitkit/memory`.

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

### GCRA (Generalized Cell Rate Algorithm)

```ts
gcra({ burst: 5, interval: 1 })
```

---

## 🎯 Real-World Example

Here's an example of how rules should be configured in practice.

In the snippet below:
* The scopes should start from global to local for IPs, accounts
* Conditionally raise the costs for expensive endpoints
* Dynamically resolve the policies e.g., subscription plan, time of day, CPU usage

```ts
const limiter = new RateLimiter({
  store,
  rules: [
    // Global protection
    {
      name: "global",
      key: "global",
      policy: fixedWindow({ window: 1, limit: 1000 }),
    },

    // Per-IP limits
    {
      name: "ip",
      key: (req) => "ip:" + req.ip,
      policy: fixedWindow({ window: 1, limit: 500 }),
    },

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
        req.user.plan === "pro" ? proPolicy : freePolicy,
    },
  ],
});
```

---

## ⚙️ Packages

LimitKit currently supports five main packages:

| Package             | Role                         | Category    | Status      |
| ------------------- | ---------------------------- | ----------- | ----------- |
| `@limitkit/core`    | Orchestration engine         | Core        | Required    |
| `@limitkit/redis`   | Redis-backed atomic policies | Storage     | Production  |
| `@limitkit/memory`  | In-memory policies           | Storage     | Development |
| `@limitkit/express` | Express middleware           | Adapter     | Optional    |
| `@limitkit/nest`    | NestJS guard and decorators  | Adapter     | Optional    |

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

## 🤝 Contributing

Contributions are welcome.

Please read [`CONTRIBUTING.md`](./CONTRIBUTING.md) for development guidelines.

---

## 📄 License

MIT