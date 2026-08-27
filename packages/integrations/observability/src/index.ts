/**
 * LimitKit OpenTelemetry integration.
 *
 * {@link OtelObserver} adapts `RateLimiter.consume()` lifecycle events to
 * OpenTelemetry spans and metrics, with no coupling to a specific backend — one
 * OTel pipeline feeds Prometheus, Grafana, Tempo, Jaeger, Datadog, Honeycomb,
 * and (via the OTLP log exporter) Loki.
 *
 * ## Quick start
 *
 * ```typescript
 * import { RateLimiter } from '@limitkit/core';
 * import { InMemoryStore, fixedWindow } from '@limitkit/memory';
 * import { OtelObserver } from '@limitkit/otel';
 *
 * const limiter = new RateLimiter({
 *   store: new InMemoryStore(),
 *   rules: [
 *     { name: 'per-ip', key: (ctx) => ctx.ip, policy: fixedWindow({ window: 60, limit: 100 }) },
 *   ],
 *   observers: [new OtelObserver()],
 * });
 * ```
 *
 * The host application wires the OpenTelemetry SDK and exporter; this package
 * only reads from the global (or a supplied) `TracerProvider` / `MeterProvider`.
 *
 * @packageDocumentation
 */

export * from './otel-observer';
export * from './types';
