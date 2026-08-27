# @limitkit/otel

**OpenTelemetry traces and metrics for LimitKit, with no coupling to a specific backend.**

`OtelObserver` subscribes to `RateLimiter.consume()` lifecycle events and turns them into
OpenTelemetry spans and metrics. One OTel pipeline then feeds Prometheus, Grafana, Tempo,
Jaeger, Datadog, Honeycomb, and — through the OTLP log exporter — Loki. There is no
`@limitkit/prometheus` or `@limitkit/loki`; the exporters cover those.

The only hard dependency is `@limitkit/core`. `@opentelemetry/api` is an optional peer — the
host application owns SDK and exporter wiring.

---

## Installation

```bash
npm install @limitkit/core @limitkit/otel @opentelemetry/api
# plus an SDK + exporter of your choice, e.g.
npm install @opentelemetry/sdk-node @opentelemetry/exporter-prometheus @opentelemetry/exporter-trace-otlp-http
```

---

## Quick example

```ts
import { RateLimiter } from '@limitkit/core';
import { InMemoryStore, fixedWindow } from '@limitkit/memory';
import { OtelObserver } from '@limitkit/otel';

const limiter = new RateLimiter<{ ip: string }>({
  store: new InMemoryStore(),
  rules: [
    {
      name: 'per-ip',
      key: (ctx) => ctx.ip,
      policy: fixedWindow({ window: 60, limit: 100 }),
    },
  ],
  observers: [new OtelObserver()],
});
```

`new OtelObserver()` reads from the **global** `TracerProvider` / `MeterProvider` by default,
so as long as your SDK is started before the first `consume()` call, nothing else is needed.
Pass an explicit `tracer` / `meter` to target a specific provider. (`otelObserver(opts)` is
available as a plain-function alias for `new OtelObserver(opts)`.)

### Wiring the SDK

```ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: 'http://localhost:4318/v1/traces',
  }),
  metricReader: new PrometheusExporter({ port: 9464 }),
});
sdk.start();
```

[`examples/observability`](../../../examples/observability) is a runnable Express service wired
up this way — it prints spans and metrics to the console, so it needs no collector.

---

## What it emits

### Spans

| Span               | Parent             | Key attributes                                                                                                  |
| ------------------ | ------------------ | --------------------------------------------------------------------------------------------------------------- |
| `limitkit.consume` | root               | `limitkit.rule_count`, `limitkit.allowed`, `limitkit.failed_rule`                                               |
| `limitkit.rule`    | `limitkit.consume` | `limitkit.rule`, `limitkit.policy`, `limitkit.cost`, `limitkit.allowed`, `limitkit.remaining`, `limitkit.limit` |

A rule whose resolver or store call throws gets `ERROR` status and a recorded exception, and
so does its `limitkit.consume` root. `consume()` still throws the original error — the
observer never changes control flow.

### Metrics

| Metric                      | Type           | Attributes                                         |
| --------------------------- | -------------- | -------------------------------------------------- |
| `limitkit.requests`         | counter        | `rule`, `outcome` (`allow` \| `reject` \| `error`) |
| `limitkit.consume.duration` | histogram (ms) | `outcome`                                          |
| `limitkit.rule.remaining`   | histogram      | `rule`                                             |

---

## The key attribute (PII)

The resolved rate-limit key is often a user id, IP address, or API key — personally
identifying and frequently high-cardinality. It is **omitted from spans by default**.

- `includeKey: true` — record the raw key as `limitkit.key`. Use only when you control the
  key space and your backend tolerates the cardinality.
- `hashKey: (key) => string` — record a hashed or bucketed value instead of the raw key.

```ts
new OtelObserver({
  hashKey: (k) => createHash('sha256').update(k).digest('hex').slice(0, 12),
});
```

---

## Options

```ts
interface OtelObserverOptions {
  tracer?: Tracer; // default: trace.getTracer('@limitkit/otel')
  meter?: Meter; // default: metrics.getMeter('@limitkit/otel')
  includeKey?: boolean;
  hashKey?: (key: string) => string;
  namespace?: string; // span/metric name prefix, default "limitkit"
}
```

---

## Grafana dashboard

`grafana-dashboard.json` ships with the package (an overview of allow/reject/error rates,
`consume()` latency percentiles, and remaining quota per rule). Import it in Grafana and
select your Prometheus data source. The panel queries assume the Prometheus exporter's
default naming (`limitkit_requests_total`, `limitkit_consume_duration_milliseconds_bucket`,
…); adjust the expressions if your exporter names metrics differently.
