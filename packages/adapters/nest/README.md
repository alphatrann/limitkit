# LimitKit NestJS Adapter

[![npm version](https://img.shields.io/npm/v/@limitkit/nest)](https://www.npmjs.com/package/@limitkit/nest)
[![downloads](https://img.shields.io/npm/dw/@limitkit/nest)](https://www.npmjs.com/package/@limitkit/nest)
[![license](https://img.shields.io/npm/l/@limitkit/nest)](https://github.com/alphatrann/limitkit/blob/main/LICENSE)

**Rate limiting for NestJS using LimitKit’s policy-driven engine.**

This package integrates LimitKit with NestJS using a global guard, while allowing **fine-grained control at controller and route level**.


---

# ⚡ Quick Start

Install:

```bash
npm install @limitkit/nest @limitkit/core @limitkit/memory
```

---

## Basic Setup

```ts
import { Module } from "@nestjs/common";
import { LimitModule } from "@limitkit/nest";
import { InMemoryStore, InMemoryFixedWindow } from "@limitkit/memory";

@Module({
  imports: [
    LimitModule.forRoot({
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
    }),
  ],
})
export class AppModule {}
```

👉 All routes are now rate-limited globally.

---

# 🧠 How It Works

* A global `LimitGuard` is automatically applied
* Every request goes through the `RateLimiter`
* Rules are evaluated in order (top → bottom)

---

# 🎯 Common Usage

## Per-user rate limiting

```ts
{
  name: "user",
  key: (req) => req.user.id,
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
rules: [
  { name: "global", key: () => "global", policy: ... },
  { name: "ip", key: (req) => req.ip, policy: ... },
  { name: "user", key: (req) => req.user.id, policy: ... },
]
```

Rules are evaluated in order:

```
global → ip → user
```

---

# 🎛 Route-Level Control

## Override limits

Use `@RateLimit()` to override or extend global rules:

```ts
import { Controller, Get } from "@nestjs/common";
import { RateLimit } from "@limitkit/nest";
import { InMemoryFixedWindow } from "@limitkit/memory";

@Controller("api")
export class ApiController {
  @Get()
  @RateLimit({
    rules: [
      {
        name: "api",
        key: (req) => req.user.id,
        policy: new InMemoryFixedWindow({
          window: 60,
          limit: 50,
          name: "fixed-window",
        }),
      },
    ],
  })
  getData() {
    return { ok: true };
  }
}
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
rules: [
  { name: "global", key: "global", policy: ... },
  { name: "user", key: (req) => req.user.id, policy: ... },
]
```

Route:

```ts
@RateLimit({
  rules: [
    { name: "user", key: (req) => req.user.id, policy: stricterPolicy },
    { name: "route", key: "route", policy: ... },
  ],
})
```

Result:

```ts
[
  { name: "global", ... },        // unchanged
  { name: "user", ... },          // overridden by route rule
  { name: "route", ... },         // appended
]
```

---

### ✅ Why this matters

This lets you:

* tighten limits per route without redefining everything
* reuse global structure
* compose rules safely without duplication

---

## Skip rate limiting

```ts
import { SkipRateLimit } from "@limitkit/nest";

@Controller()
export class HealthController {
  @Get("/health")
  @SkipRateLimit()
  health() {
    return { ok: true };
  }
}
```

---

# ⚖️ Weighted Requests

```ts
{
  key: (req) => req.user.id,
  cost: (req) => req.route.path === "/generate-report" ? 10 : 1,
  policy: new InMemoryTokenBucket({
    capacity: 100,
    refillRate: 5,
    name: "token-bucket",
  }),
}
```

Expensive operations consume more quota.

---

# 🏢 Dynamic Policies (SaaS Plans)

```ts
{
  key: (ctx) => ctx.user.id,
  policy: (ctx) => {
    if (ctx.user.plan === "free")
      return new InMemoryTokenBucket({ capacity: 50, refillRate: 1 });

    if (ctx.user.plan === "pro")
      return new InMemoryTokenBucket({ capacity: 500, refillRate: 10 });
  },
}
```

Define limits based on business logic.

---

# 🔌 Async Configuration (Redis, ConfigService, etc.)

Use `forRootAsync` when config depends on other providers:

```ts
import { Module } from "@nestjs/common";
import { LimitModule } from "@limitkit/nest";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { RedisStore, RedisFixedWindow } from "@limitkit/redis";
import { createClient } from "redis";

@Module({
  imports: [
    ConfigModule.forRoot(),
    LimitModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const redis = createClient({
          url: config.get("REDIS_URL"),
        });

        await redis.connect();

        return {
          store: new RedisStore(redis),
          rules: [
            {
              name: "global",
              key: "global",
              policy: new RedisFixedWindow({
                window: 60,
                limit: 100,
                name: "fixed-window",
              }),
            },
          ],
        };
      },
    }),
  ],
})
export class AppModule {}
```

---

# 💉 Using RateLimiter in Services

You can inject the limiter directly:

```ts
import { Injectable } from "@nestjs/common";
import { RateLimiter } from "@limitkit/core";

@Injectable()
export class MyService {
  constructor(private limiter: RateLimiter) {}

  async doSomething(req) {
    const result = await this.limiter.consume(req);

    if (!result.allowed) {
      throw new Error("Rate limit exceeded");
    }
  }
}
```

---

# 🧩 Features

* Global rate limiting via guard
* Route-level overrides (`@RateLimit`)
* Route exclusions (`@SkipRateLimit`)
* Policy-driven rules
* Weighted requests
* Dynamic runtime policies
* Works with all LimitKit stores and algorithms

---

# 🏁 Summary

LimitKit for NestJS gives you:

* **zero-config global protection**
* **fine-grained control per route**
* **policy-driven flexibility beyond middleware**