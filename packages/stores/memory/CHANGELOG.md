# @limitkit/memory

## 1.2.0

### Minor Changes

- ddb5d39: Add `limiter.peek(ctx)`, which reports what `consume(ctx)` would return without consuming anything: no state update, no TTL refresh, no sliding-window entry. Every rule is evaluated (no short-circuit) so `rules` is complete for `X-RateLimit-*` headers, and `failedRule` is the first rule that would reject. Observers receive `peek.start` / `peek.allow` / `peek.reject` / `peek.error` (`onPeekStart`, …) instead of `consume.*` / `rule.*`. `Store` gains an optional `peek(key, algorithm, now, cost)`, implemented by the memory store (pure read, with a read-only sliding-window scan), the Redis store (the existing Lua scripts take a no-write flag, sent only for peeks), and the Postgres store (plain `SELECT`s, no lock or transaction); `limiter.peek` throws for stores without it. Also fixes the Postgres sliding window inserting a zero-cost log row on a `cost: 0` consume.

### Patch Changes

- Updated dependencies [ddb5d39]
  - @limitkit/core@1.6.0

## 1.1.1

### Patch Changes

- 9404ddb: Add `@limitkit/postgres`, a Postgres-backed durable rate limiting store using `SELECT ... FOR UPDATE` transactions instead of Lua scripts or in-memory maps.

  Extracted the pure per-algorithm reducer functions (Fixed Window, Sliding Window Counter, Token Bucket, Leaky Bucket, Shaping Leaky Bucket, GCRA) into a shared kernel in `@limitkit/core`, reused by both `@limitkit/memory` and `@limitkit/postgres` so behavior stays identical across stores. `@limitkit/memory`'s public API and behavior are unchanged.

- Updated dependencies [9404ddb]
  - @limitkit/core@1.2.0

## 1.1.0

### Minor Changes

- Add traffic shaper leaky bucket algorithm support

### Patch Changes

- Updated dependencies
  - @limitkit/core@1.1.0

## 1.0.1

- Update outdated README

## 1.0.0

- Initial working release
