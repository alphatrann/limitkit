# @limitkit/core

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
