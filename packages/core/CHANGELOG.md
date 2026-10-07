# @limitkit/core

## 1.6.0

### Minor Changes

- ddb5d39: Add `limiter.peek(ctx)`, which reports what `consume(ctx)` would return without consuming anything: no state update, no TTL refresh, no sliding-window entry. Every rule is evaluated (no short-circuit) so `rules` is complete for `X-RateLimit-*` headers, and `failedRule` is the first rule that would reject. Observers receive `peek.start` / `peek.allow` / `peek.reject` / `peek.error` (`onPeekStart`, …) instead of `consume.*` / `rule.*`. `Store` gains an optional `peek(key, algorithm, now, cost)`, implemented by the memory store (pure read, with a read-only sliding-window scan), the Redis store (the existing Lua scripts take a no-write flag, sent only for peeks), and the Postgres store (plain `SELECT`s, no lock or transaction); `limiter.peek` throws for stores without it. Also fixes the Postgres sliding window inserting a zero-cost log row on a `cost: 0` consume.

## 1.5.0

### Minor Changes

- 04628ec: Add rule groups and `RateLimiter.extend()`. An entry in `rules` can now be a group `{ mode: 'all' | 'any', rules, name?, when? }` that nests: `all` requires every child to allow and short-circuits on the first reject, while `any` evaluates every child and rejects only when all evaluated children reject (`failedRule` is the group's `name`, else the first rejected child). `result.rules` stays flat. `limiter.extend(rules)` returns a new limiter with the rules appended, sharing the same store and observers, and can narrow the context type.

## 1.4.0

### Minor Changes

- 95586c6: Add three optional fields to `LimitRule`:

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

## 1.3.0

### Minor Changes

- 1e255d6: Add observability lifecycle events to `RateLimiter` and a first-party `@limitkit/otel` OpenTelemetry integration.

  `RateLimiter.consume()` now emits a `consume`-level root event plus per-rule `start` / `allow` / `reject` / `error` events to any registered `RateLimitObserver`. Each event carries a shared request id — also returned on the new `RateLimitResult.id` field — and terminal events carry `durationMs`. Observers are registered via a new `observers` option on `RateLimitConfig` or `limiter.subscribe(observer)` (which returns an unsubscribe function). Event dispatch is synchronous and isolated: a throwing observer is routed to `onObserverError` and never aborts `consume()`, the rule loop, or the other observers. All additions are backwards compatible; resolution order, short-circuit behaviour, and thrown errors are unchanged. Also sets the missing `name` on `UndefinedKeyException`.

  `@limitkit/otel` provides `OtelObserver` (with an `otelObserver()` factory alias): one `limitkit.consume` root span per call with a `limitkit.rule` child span per rule, a `limitkit.requests` counter tagged by `rule` and `outcome` (`allow` / `reject` / `error`), and `limitkit.consume.duration` / `limitkit.rule.remaining` histograms. It depends only on `@limitkit/core`, with `@opentelemetry/api` as an optional peer, and ships a Grafana dashboard template. One OTel pipeline covers Prometheus, Grafana, Tempo, Jaeger, Datadog, Honeycomb, and (via the OTLP log exporter) Loki, so there are no per-backend LimitKit packages.

## 1.2.0

### Minor Changes

- 9404ddb: Add `@limitkit/postgres`, a Postgres-backed durable rate limiting store using `SELECT ... FOR UPDATE` transactions instead of Lua scripts or in-memory maps.

  Extracted the pure per-algorithm reducer functions (Fixed Window, Sliding Window Counter, Token Bucket, Leaky Bucket, Shaping Leaky Bucket, GCRA) into a shared kernel in `@limitkit/core`, reused by both `@limitkit/memory` and `@limitkit/postgres` so behavior stays identical across stores. `@limitkit/memory`'s public API and behavior are unchanged.

## 1.1.0

### Minor Changes

- Add traffic shaper leaky bucket algorithm support

## 1.0.2

- Update outdated README

## 1.0.1

- Update outdated JSDoc for public APIs

## 1.0.0

- Initial working release
