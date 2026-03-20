# LimitKit

**Flexible, composable rate limiting for modern Node.js applications.**

Stop rewriting rate limiting logic every time your requirements change.

LimitKit is a **rate limiting engine**, not just a middleware — designed for systems that need **dynamic policies, multiple layers, and pluggable storage**.

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

```bash
npm install @limitkit/core @limitkit/memory
```

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
      key: (req) => req.ip,
      policy: fixedWindow({ window: 60, limit: 100 }),
    },
  ],
});

const result = await limiter.consume(req);

if (!result.allowed) {
  throw new TooManyRequestsException();
}
```

---

## 🧠 How it works

```
Request → Rules → Key → Policy → Store → Decision
```

Each rule:

1. Generates a key (who to limit)
2. Resolves a policy (how to limit)
3. Consumes from the store (atomic)
4. Returns allow / reject

Rules are evaluated **sequentially**.

---

## 🧩 Core Concepts

### Rule

```ts
{ name, key, policy, cost? }
```

* **name** → identifier
* **key** → target (IP, user, global, etc.)
* **policy** → rate limiting strategy (can be dynamic)
* **cost** → weight per request (default: 1)

---

## 🧠 Policies

LimitKit supports common strategies:

* Fixed Window
* Sliding Window
* Sliding Window Counter
* Token Bucket
* Leaky Bucket
* GCRA

All policies are:

* store-optimized
* interchangeable
* optionally dynamic

---

## 🎯 Real-World Example

```ts
const limiter = new RateLimiter({
  store,
  rules: [
    // Global protection
    {
      name: "global",
      key: () => "global",
      policy: fixedWindow({ window: 1, limit: 1000 }),
    },

    // Per-user limits
    {
      name: "user",
      key: (req) => req.user.id,
      policy: slidingWindow({ window: 60, limit: 100 }),
    },

    // Expensive endpoints
    {
      name: "costly",
      key: (req) => req.user.id,
      cost: (req) => (req.path.includes("export") ? 10 : 1),
      policy: tokenBucket({ refillRate: 5, capacity: 100 }),
    },

    // SaaS plan-based limits
    {
      name: "plan",
      key: (req) => req.user.id,
      policy: (req) =>
        req.user.plan === "pro" ? proPolicy : freePolicy,
    },
  ],
});
```

---

## ⚙️ Packages

| Package             | Role                         | Status      |
| ------------------- | ---------------------------- | ----------- |
| `@limitkit/core`    | Orchestration engine         | Required    |
| `@limitkit/redis`   | Redis-backed atomic policies | Production  |
| `@limitkit/memory`  | In-memory policies           | Development |
| `@limitkit/express` | Express middleware           | Optional    |
| `@limitkit/nest`    | NestJS guard/interceptor     | Optional    |

---

## 🧑‍💻 Common Recipes

### 🔐 Login Protection

```ts
{ key: (req) => req.ip, policy: fixedWindow({ window: 60, limit: 5 }) }
```

### 💸 Expensive Endpoints

```ts
{ key: (req) => req.user.id, cost: 10, policy: tokenBucket({ refillRate: 5, capacity: 1000 }) }
```

### 🏢 SaaS Plans

```ts
{
  key: (ctx) => ctx.user.id,
  policy: (ctx) => ctx.user.plan === "pro" ? proPolicy : freePolicy
}
```

---

## 🤝 Contributing

Contributions are welcome.

Please read [`CONTRIBUTING.md`](./CONTRIBUTING.md).

---

## 📄 License

MIT