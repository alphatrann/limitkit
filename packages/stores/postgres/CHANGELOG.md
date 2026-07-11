# @limitkit/postgres

## 1.1.0

### Minor Changes

- 9404ddb: Add `@limitkit/postgres`, a Postgres-backed durable rate limiting store using `SELECT ... FOR UPDATE` transactions instead of Lua scripts or in-memory maps.

  Extracted the pure per-algorithm reducer functions (Fixed Window, Sliding Window Counter, Token Bucket, Leaky Bucket, Shaping Leaky Bucket, GCRA) into a shared kernel in `@limitkit/core`, reused by both `@limitkit/memory` and `@limitkit/postgres` so behavior stays identical across stores. `@limitkit/memory`'s public API and behavior are unchanged.

### Patch Changes

- Updated dependencies [9404ddb]
  - @limitkit/core@1.2.0
