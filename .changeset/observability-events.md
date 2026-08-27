---
'@limitkit/otel': minor
'@limitkit/core': minor
---

Add observability lifecycle events to `RateLimiter` and a first-party `@limitkit/otel` OpenTelemetry integration.

`RateLimiter.consume()` now emits a `consume`-level root event plus per-rule `start` / `allow` / `reject` / `error` events to any registered `RateLimitObserver`. Each event carries a shared request id — also returned on the new `RateLimitResult.id` field — and terminal events carry `durationMs`. Observers are registered via a new `observers` option on `RateLimitConfig` or `limiter.subscribe(observer)` (which returns an unsubscribe function). Event dispatch is synchronous and isolated: a throwing observer is routed to `onObserverError` and never aborts `consume()`, the rule loop, or the other observers. All additions are backwards compatible; resolution order, short-circuit behaviour, and thrown errors are unchanged. Also sets the missing `name` on `UndefinedKeyException`.

`@limitkit/otel` provides `OtelObserver` (with an `otelObserver()` factory alias): one `limitkit.consume` root span per call with a `limitkit.rule` child span per rule, a `limitkit.requests` counter tagged by `rule` and `outcome` (`allow` / `reject` / `error`), and `limitkit.consume.duration` / `limitkit.rule.remaining` histograms. It depends only on `@limitkit/core`, with `@opentelemetry/api` as an optional peer, and ships a Grafana dashboard template. One OTel pipeline covers Prometheus, Grafana, Tempo, Jaeger, Datadog, Honeycomb, and (via the OTLP log exporter) Loki, so there are no per-backend LimitKit packages.
