# Roadmap

This document tracks what's planned, in progress, and under consideration for LimitKit.

Current stable release: **v1.1.0**

---

## Planned

### PostgreSQL store (`@limitkit/postgres`)

The highest-priority addition. Many teams don't run Redis and currently reach for `rate-limiter-flexible` specifically for its Postgres support.

Atomicity approach per algorithm:

- **Fixed window, sliding window counter**: single `INSERT ... ON CONFLICT DO UPDATE` — no lock needed
- **Token bucket, GCRA**: `SELECT ... FOR UPDATE` to safely read-then-write token state
- **Sliding window (exact log)**: one row per request with a timestamp index; expired rows cleaned up on read

### Redis: Sentinel and Cluster

**Sentinel** (high availability / automatic failover): The existing `RedisStore` accepts any Redis-compatible client. `ioredis` supports Sentinel natively, so this likely already works — the goal is documentation and test coverage against a real Sentinel setup.

**Cluster** (horizontal sharding): Single-key Lua scripts already work because each key maps to one slot. Constraint: any future multi-key atomic operations would require Redis hash tags (`{prefix}:key`) to ensure co-location. Constraints will be documented and tested.

### Observability via OpenTelemetry

An observer interface on `RateLimiter` for emitting lifecycle events without coupling to a specific backend:

```ts
const limiter = new RateLimiter({
  store,
  rules,
  observers: [otelObserver()],
});
```

`RateLimiter.consume()` emits a `consume`-level root event plus per-rule
`start` / `allow` / `reject` / `error` events; each carries a shared request id
(also returned on `RateLimitResult.id`) and timing. A `RateLimitObserver` is a
plain object implementing whichever handlers it needs; register it via
`observers` above or `limiter.subscribe(observer)`. A throwing observer can never
break `consume()`.

`@limitkit/otel` is the first-party observer: one `limitkit.consume` root span
with a `limitkit.rule` child per rule, an `outcome`-tagged request counter, and
`consume()` / remaining-quota histograms. One OTel pipeline covers Prometheus
(via exporter), Grafana, Tempo, Jaeger, Datadog, Honeycomb, and — via the OTLP
log exporter — Loki, so there are no per-backend LimitKit packages.

A companion Grafana dashboard template ships in the package
(`packages/integrations/observability/grafana-dashboard.json`).

### Fastify adapter (`@limitkit/fastify`)

Fastify is growing quickly and is underserved by existing rate limiting libraries. The adapter will follow the same shape as `@limitkit/express`: a plugin that wraps a `RateLimiter`, sets standard rate-limit headers, and supports route-level rule overrides via Fastify's decorator/hook system.

---

## Shipped

### AI & token tracking (`@limitkit/ai`)

Shipped as [`@limitkit/ai`](./packages/integrations/ai/README.md) rather than as documentation: token-usage extractors for OpenAI, Anthropic, Ollama, and Hugging Face; `monthlyTokenBudget` / `weeklyTokenBudget` / `sessionTokenBudget` presets over `tokenBucket`; and `modelWeightedCost` for model-tiered cost weighting. [`examples/llm-gateway`](./examples/llm-gateway) combines a monthly token quota with per-IP and per-plan burst limits.

Follow-up: **reserve / commit** (below), which the example works around today.

---

## Under consideration

**Reserve / commit (two-phase consume)** — an LLM call's cost isn't known until it returns, so a budget can only be charged after the fact, by which point refusing is pointless. The workaround is to reserve an estimate up front and charge the overage afterwards, but LimitKit cannot release the unused part of an over-estimate, so users are overcharged for short responses.

A two-phase API would close this:

```ts
const reservation = await limiter.reserve(ctx, estimatedCost);
if (!reservation.allowed) return 429;

const actual = await callModel();
await reservation.commit(actual.tokensUsed); // releases the difference
```

Open questions: what happens to a reservation that is never committed (a TTL, presumably), and whether `commit` may exceed the reservation. Applies well beyond LLMs — any operation whose true cost is known only after it runs.

**MongoDB store** — follows the same store interface as `@limitkit/postgres`. Lower priority since Redis covers most distributed use cases, but useful for teams already running Mongo.

**MySQL store** — same as above.

**Hono adapter** — for edge and serverless environments (Cloudflare Workers, Deno). Hono's request/response model differs from Node.js enough to warrant careful design before committing.

**Dry-run mode** — evaluate all rules without consuming counters, returning which would fail. Useful for monitoring, canary rule rollouts, and testing configurations against live traffic without enforcing them.

**`@limitkit/testing`** — a mock store and test helpers for writing unit tests against rate-limited code without a real Redis or Postgres instance.

**`limitkit` meta-package** — a single `npm install limitkit` that re-exports `@limitkit/core` and `@limitkit/memory`, lowering friction for first-time users.

---

## Not planned

**Custom dashboard UI** — OpenTelemetry + Grafana is the right tool here. Maintaining a dashboard UI is significant ongoing cost with less ecosystem leverage than a single OTel integration.

**Adaptive / auto-tuning rate limits** — out of scope. LimitKit's model is explicitly declarative; dynamic limit adjustment based on system load belongs in the application layer.
