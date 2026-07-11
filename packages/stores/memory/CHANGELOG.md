# @limitkit/memory

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
