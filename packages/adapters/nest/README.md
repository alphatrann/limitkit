# @limitkit/nest

NestJS integration for **LimitKit**.

Provides a global guard and decorators for applying rate limiting to controllers and routes.

👉 Main project: https://github.com/alphatrann/limitkit

---

## Installation

```bash
npm install @limitkit/nest
````

Install a store package:

```bash
npm install @limitkit/memory
```

---

## Setup

Register the module in your NestJS application.

```ts
import { LimitModule } from "@limitkit/nest"

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
            limit: 100
          })
        }
      ]
    })
  ]
})
export class AppModule {}
```

---

## Decorators

### `@RateLimit`

Apply rate limiting rules to controllers or routes.

```ts
@RateLimit({
  rules: [
    {
      name: "login",
      key: (req) => req.ip,
      policy: new InMemoryFixedWindow({
        name: "fixed-window",
        window: 60,
        limit: 5
      })
    }
  ]
})
@Post("/login")
login() {}
```

---

### `@SkipRateLimit`

Disable rate limiting for a route or controller.

```ts
@SkipRateLimit()
@Get("/health")
healthCheck() {}
```

---

## Rule Precedence

Rate limit rules are resolved in the following order:

```
Global rules
→ Controller rules
→ Route rules
```

Route rules override controller and global rules when names match.