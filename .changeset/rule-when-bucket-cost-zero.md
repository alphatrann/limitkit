---
'@limitkit/core': minor
'@limitkit/otel': minor
---

Add three optional fields to `LimitRule`:

- **`when`** — a `boolean | (ctx) => boolean | Promise<boolean>` predicate,
  resolved before `key` / `policy` / `cost`. When falsy the rule is skipped
  entirely: nothing else is resolved, the store is not touched, the rule emits
  a new `rule.skip` lifecycle event (handled by `@limitkit/otel` as an
  `outcome=skip` request), and it is absent from `result.rules`. A request that
  skips every rule is allowed.
- **`bucket`** — the rule's storage scope, defaulting to `name`. Rules now only
  share quota state when they resolve to the same scope; give two rules the same
  `bucket` to make them draw down one allowance. ⚠️ The store-key format gains a
  scope segment (`ratelimit:{scope}:{algorithm}:{hash}:{key}`), so existing
  Redis/Postgres rate-limit counters are not found after upgrading and each rule
  starts from a fresh window once.
- **`cost: 0`** — now accepted (only negative costs throw) and treated as an
  inert probe: the rule is evaluated and reported in `result.rules` for
  headers/telemetry, but never rejects and never advances stored state.

`@limitkit/otel` gains a `skip` value on `LimitOutcome` and an `onRuleSkip`
handler that closes the rule span and records the outcome.
