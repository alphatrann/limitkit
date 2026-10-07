---
'@limitkit/core': minor
'@limitkit/memory': minor
'@limitkit/redis': minor
'@limitkit/postgres': minor
---

Add `limiter.peek(ctx)`, which reports what `consume(ctx)` would return without consuming anything: no state update, no TTL refresh, no sliding-window entry. Every rule is evaluated (no short-circuit) so `rules` is complete for `X-RateLimit-*` headers, and `failedRule` is the first rule that would reject. Observers receive `peek.start` / `peek.allow` / `peek.reject` / `peek.error` (`onPeekStart`, …) instead of `consume.*` / `rule.*`. `Store` gains an optional `peek(key, algorithm, now, cost)`, implemented by the memory store (pure read, with a read-only sliding-window scan), the Redis store (the existing Lua scripts take a no-write flag, sent only for peeks), and the Postgres store (plain `SELECT`s, no lock or transaction); `limiter.peek` throws for stores without it. Also fixes the Postgres sliding window inserting a zero-cost log row on a `cost: 0` consume.
