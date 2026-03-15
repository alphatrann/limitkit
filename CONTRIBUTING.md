# Contributing to LimitKit

Thank you for your interest in contributing to **LimitKit**!
We welcome contributions of all kinds including bug fixes, documentation improvements, new algorithms, and performance optimizations.

---

# Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Coding Guidelines](#coding-guidelines)
- [Adding New Algorithms](#adding-new-algorithms)
- [Adding New Stores](#adding-new-stores)
- [Testing](#testing)
- [Submitting a Pull Request](#submitting-a-pull-request)

---

# Getting Started

Before contributing, please:

1. Check existing **issues** to see if the problem has already been reported.
2. Open an **issue** for major features before implementing them.
3. Fork the repository and create a new branch for your changes.

---

# Development Setup

Clone the repository:

```bash
git clone https://github.com/alphatrann/limitkit.git
cd limitkit
````

Install dependencies:

```bash
yarn install
```

Build packages:
```bash
yarn build
```

Run tests:

```bash
yarn test
```

---

# Project Structure

LimitKit is organized as a **modular monorepo**.

Tech Stack:

* Yarn Workspace
* Turborepo
* TypeScript


```
packages/
├───adapters/
│   ├───express/
│   │   ├───src/
│   │   │   ├───middlewares/
│   │   │   └───types/
│   │   └───__tests__/
│   └───nest/
│       └───libs/
│           └───limit/
│               ├───src/
│               │   ├───decorators/
│               │   ├───exceptions/
│               │   ├───guards/
│               │   └───types/
│               └───tests/
│                   ├───controllers/
│                   └───utils/
├───core/
│   ├───src/
│   │   ├───algorithms/
│   │   ├───exceptions/
│   │   ├───types/
│   │   └───utils/
│   ├───__mocks__/
│   └───__tests__/
└───stores/
    ├───memory/
    │   ├───src/
    │   │   ├───algorithms/
    │   │   └───types/
    │   └───__tests__/
    └───redis/
        ├───src/
        │   ├───algorithms/
        │   └───types/
        └───__tests__/
```

Core design layers:

```
Application
     ↓
RateLimiter
     ↓
Store
     ↓
Algorithm
```

---

# Coding Guidelines

Please follow these conventions:

### TypeScript

* Use **strict TypeScript types**
* Avoid `any` where possible
* Prefer **interfaces for public APIs**

### Code Style

* Files and folders are named in **kebab case**
* Use descriptive variable names
* Keep functions small and focused
* Write JSDoc comments for public APIs

Example:

```ts
/**
 * Consume tokens from a rate limit policy
 */
consume(context: Request): Promise<ConsumeResult>
```

---

# Adding New Algorithms

LimitKit is designed to support **custom rate limiting algorithms**.

Algorithms must implement the `Algorithm` interface.

Example:

```ts
export class MyAlgorithm implements Algorithm<MyConfig> {

  constructor(public readonly config: MyConfig) {}

  validate(): void {
    if (this.config.limit <= 0) {
      throw new Error("limit must be positive")
    }
  }

}
```

If the algorithm supports in-memory execution, it may also implement the `InMemoryCompatible<TState>`.

```ts
class MyInMemoryAlgorithm implements Algorithm<MyConfig>, InMemoryCompatible<MyState> {
  process(state: MyState | undefined, now: number, cost: number=1): { state: MyState; output: RateLimitResult } {
    return {
      state,
      output: {
        allowed: true,
        remaining: 100,
        reset: 1700000000
      }
    }
  }
}
```

If the algorithm supports **Redis execution**, it may also implement `RedisCompatible`.

Example:

```ts
class MyRedisAlgorithm implements RedisCompatible {

  luaScript = `
    -- Redis Lua script
  `

  getLuaArgs(now: number, cost: number) {
    return [now.toString(), cost.toString()]
  }

}
```

---

# Adding New Stores

Stores control how rate limiting state is persisted.

To implement a custom store, implement the `Store` interface.

Example:

```ts
export class MyStore implements Store {

  async consume(key, algorithm, now, cost) {
    // store-specific logic
  }

}
```

Stores can integrate with systems like:

* Redis
* DynamoDB
* PostgreSQL
* MongoDB
* Cloudflare KV

---

# Testing

All contributions must include **tests** where appropriate.

Run tests:

```bash
yarn test
```

Testing guidelines:

* Test public APIs
* Test edge cases
* Mock external dependencies when possible

A Redis container for testing is available at [compose.test.yml](./compose.test.yml). Feel free to add other databases if needed:

```bash
docker compose -f compose.test.yml up -d
```

Example test structure:

```
__tests__/
  rate-limiter.test.ts
  fixed-window.test.ts
  sliding-window.test.ts
```

For NestJS adapter, unit and integration test files are next to the business logic file.

```
guards/
  limit.guard.test.ts
  limit.guard.ts
```

whereas e2e tests are in a dedicated tests/ folder (in libs/limit/ directory)
```
libs/limit/
  src/
  tests/
```

---

# Submitting a Pull Request

1. Fork the repository
2. Create a new branch

```bash
git checkout -b feature/my-feature
```

3. Commit your changes

```bash
git commit -m "feat: add sliding window algorithm"
```

4. Push your branch

```bash
git push origin feature/my-feature
```

5. Open a **Pull Request** on GitHub

---

# Pull Request Guidelines

Please ensure:

* Tests pass
* Code follows project style
* Documentation is updated if needed
* Commits are clear and descriptive

Example commit messages:

```
feat: add sliding window counter algorithm
fix: correct reset time calculation
docs: update README examples
test: add middleware tests
```

---

# Code of Conduct

Please be respectful and constructive in discussions.

This project aims to foster a welcoming and inclusive environment for all contributors.

---

# Thank You

Your contributions help improve **LimitKit** and make it more useful for the community.