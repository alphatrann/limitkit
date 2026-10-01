---
'@limitkit/core': minor
---

Add rule groups and `RateLimiter.extend()`. An entry in `rules` can now be a group `{ mode: 'all' | 'any', rules, name?, when? }` that nests: `all` requires every child to allow and short-circuits on the first reject, while `any` evaluates every child and rejects only when all evaluated children reject (`failedRule` is the group's `name`, else the first rejected child). `result.rules` stays flat. `limiter.extend(rules)` returns a new limiter with the rules appended, sharing the same store and observers, and can narrow the context type.
