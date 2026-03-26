# LimitKit NestJS Adapter

[![npm version](https://img.shields.io/npm/v/@limitkit/nest)](https://www.npmjs.com/package/@limitkit/nest)
[![downloads](https://img.shields.io/npm/dw/@limitkit/nest)](https://www.npmjs.com/package/@limitkit/nest)
[![license](https://img.shields.io/npm/l/@limitkit/nest)](https://github.com/alphatrann/limitkit/blob/main/LICENSE)

**Rate limiting for NestJS using LimitKit’s policy-driven engine.**

This package:

* ✅ integrates with NestJS seamlessly
* ✅ allows you to override global rules for particular controllers or routes
* ✅ returns 429 if the request is rejected
* ✅ automatically sets standard IETF rate limit headers

---

## ⚡ Quick Start

```bash
npm install @limitkit/nest
```

---

## Basic Setup

Simply call `LimitModule.forRoot`, provide the store and the rules.

All routes are now rate-limited globally.

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
          key: (req) => "ip:" + req.ip,
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


---

## 🎛 Route-Level Control

### Override rules

Use `@RateLimit()` to override or extend global rules on a controller or route:

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
        key: (req) => "acc:" + req.user.id,
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

#### 🧠 Merge Behavior

Route-level rules are merged with global rules by `name`:

* If a rule with the **same `name` exists**, it is **overridden**
* If the `name` is **new**, it is **appended**

---

#### Example

Global:

```ts
rules: [
  { name: "global", key: "global", policy: ... },
  { name: "user", key: (req) => "acc:" + req.user.id, policy: ... },
]
```

Route:

```ts
@RateLimit({
  rules: [
    { name: "user", key: (req) => "acc:" + req.user.id, policy: stricterPolicy },
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

### Skip rate limiting

Simply add `@SkipRateLimit` decorator to a controller or route to bypass rate limits.

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

If `@SkipRateLimit` is applied to a controller, but `@RateLimit` is applied to a route within it then the route will bypass all global limits and only the rules defined in the decorator are enforced.

---

## Async Configuration (Redis, ConfigService, etc.)

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

## 💉 Using RateLimiter in Services

You can inject the limiter directly in the module that imports `LimitModule` for custom contexts such as GraphQL, WebSockets, job queues:

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

## 📡 Headers

The guard provided by `@limitkit/nest` also automatically sets standard IETF rate limit headers for you:

```
RateLimit-Limit
RateLimit-Remaining
Retry-After (when 429)
```

Along with that, the guard also sets a custom header:
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