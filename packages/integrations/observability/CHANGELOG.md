# @limitkit/otel

## 0.3.0

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

### Patch Changes

- Updated dependencies [95586c6]
  - @limitkit/core@1.4.0

## 0.2.0

### Minor Changes

- 1e255d6: Add observability lifecycle events to `RateLimiter` and a first-party `@limitkit/otel` OpenTelemetry integration.

  `RateLimiter.consume()` now emits a `consume`-level root event plus per-rule `start` / `allow` / `reject` / `error` events to any registered `RateLimitObserver`. Each event carries a shared request id — also returned on the new `RateLimitResult.id` field — and terminal events carry `durationMs`. Observers are registered via a new `observers` option on `RateLimitConfig` or `limiter.subscribe(observer)` (which returns an unsubscribe function). Event dispatch is synchronous and isolated: a throwing observer is routed to `onObserverError` and never aborts `consume()`, the rule loop, or the other observers. All additions are backwards compatible; resolution order, short-circuit behaviour, and thrown errors are unchanged. Also sets the missing `name` on `UndefinedKeyException`.

  `@limitkit/otel` provides `OtelObserver` (with an `otelObserver()` factory alias): one `limitkit.consume` root span per call with a `limitkit.rule` child span per rule, a `limitkit.requests` counter tagged by `rule` and `outcome` (`allow` / `reject` / `error`), and `limitkit.consume.duration` / `limitkit.rule.remaining` histograms. It depends only on `@limitkit/core`, with `@opentelemetry/api` as an optional peer, and ships a Grafana dashboard template. One OTel pipeline covers Prometheus, Grafana, Tempo, Jaeger, Datadog, Honeycomb, and (via the OTLP log exporter) Loki, so there are no per-backend LimitKit packages.

### Patch Changes

- Updated dependencies [1e255d6]
  - @limitkit/core@1.3.0
