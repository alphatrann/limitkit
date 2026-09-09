# LimitKit NestJS Adapter

[![npm version](https://img.shields.io/npm/v/@limitkit/nest)](https://www.npmjs.com/package/@limitkit/nest)
[![downloads](https://img.shields.io/npm/dw/@limitkit/nest)](https://www.npmjs.com/package/@limitkit/nest)
[![license](https://img.shields.io/npm/l/@limitkit/nest)](https://github.com/alphatrann/limitkit/blob/main/LICENSE)

Rate limiting for NestJS using LimitKit's policy-driven engine.

This package:

- integrates with NestJS
- allows you to override global rules for particular controllers or routes
- returns 429 if the request is rejected
- automatically sets standard IETF rate limit headers

---

## Quick Start

```bash
npm install @limitkit/nest
```

---

## Basic Setup

Call `LimitModule.forRoot`, provide the store and the rules.

All routes are now rate-limited globally.

```ts
import { Module } from '@nestjs/common';
import { LimitModule } from '@limitkit/nest';
import { InMemoryStore, InMemoryFixedWindow } from '@limitkit/memory';

@Module({
  imports: [
    LimitModule.forRoot({
      store: new InMemoryStore(),
      rules: [
        {
          name: 'global',
          key: (req) => 'ip:' + req.ip,
          policy: new InMemoryFixedWindow({
            name: 'fixed-window',
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

## Route-Level Control

### Override rules

Use `@RateLimit()` to override or extend global rules on a controller or route:

```ts
import { Controller, Get } from '@nestjs/common';
import { RateLimit } from '@limitkit/nest';
import { InMemoryFixedWindow } from '@limitkit/memory';

@Controller('api')
export class ApiController {
  @Get()
  @RateLimit({
    rules: [
      {
        name: 'api',
        key: (req) => 'acc:' + req.user.id,
        policy: new InMemoryFixedWindow({
          window: 60,
          limit: 50,
          name: 'fixed-window',
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

#### Merge Behavior

Route-level rules are merged with global rules by `name`:

- If a rule with the same `name` exists, it is overridden
- If the `name` is new, it is appended

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

Add the `@SkipRateLimit` decorator to a controller or route to bypass rate limits.

```ts
import { SkipRateLimit } from '@limitkit/nest';

@Controller()
export class HealthController {
  @Get('/health')
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
import { Module } from '@nestjs/common';
import { LimitModule } from '@limitkit/nest';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisStore, RedisFixedWindow } from '@limitkit/redis';
import { createClient } from 'redis';

@Module({
  imports: [
    ConfigModule.forRoot(),
    LimitModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const redis = createClient({
          url: config.get('REDIS_URL'),
        });

        await redis.connect();

        return {
          store: new RedisStore(redis),
          rules: [
            {
              name: 'global',
              key: 'global',
              policy: new RedisFixedWindow({
                window: 60,
                limit: 100,
                name: 'fixed-window',
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

## Using RateLimiter in Services

You can inject the limiter directly in the module that imports `LimitModule` for custom contexts such as GraphQL, WebSockets, job queues:

```ts
import { Injectable } from '@nestjs/common';
import { RateLimiter } from '@limitkit/core';

@Injectable()
export class MyService {
  constructor(private limiter: RateLimiter) {}

  async doSomething(req) {
    const result = await this.limiter.consume(req);

    if (!result.allowed) {
      throw new Error('Rate limit exceeded');
    }
  }
}
```

## Headers

The guard sets two representations of the same information.

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
