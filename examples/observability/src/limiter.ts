import { createHash } from 'node:crypto';
import { RateLimiter } from '@limitkit/core';
import { InMemoryStore, fixedWindow, tokenBucket } from '@limitkit/memory';
import { OtelObserver } from '@limitkit/otel';

/** What the rules need to know about a request. */
export interface RequestContext {
  /** Caller IP — a coarse per-client abuse limit. */
  ip: string;
  /** API key identifying the account — a per-account burst allowance. */
  apiKey: string;
}

/**
 * The whole integration: hand an `OtelObserver` to the limiter and every
 * `consume()` call emits a `limitkit.consume` span, a `limitkit.rule` child
 * span per rule, and the `limitkit.requests` / `limitkit.consume.duration` /
 * `limitkit.rule.remaining` metrics — through whatever global providers
 * `startTelemetry()` registered.
 *
 * The resolved key here is a raw IP or API key: personally identifying and
 * high-cardinality, so it's hashed before it can land on a span. Drop `hashKey`
 * to omit the key entirely (the default), or pass `includeKey: true` when you
 * own the key space and your backend can take the cardinality.
 */
const observer = new OtelObserver({
  hashKey: (key) => createHash('sha256').update(key).digest('hex').slice(0, 12),
});

export const limiter = new RateLimiter<RequestContext>({
  store: new InMemoryStore(),
  rules: [
    {
      name: 'per-ip',
      key: (ctx) => 'ip:' + ctx.ip,
      policy: fixedWindow({ window: 60, limit: 60 }),
    },
    {
      name: 'per-key-burst',
      key: (ctx) => 'key:' + ctx.apiKey,
      policy: tokenBucket({ capacity: 10, refillRate: 2 }),
    },
  ],
  observers: [observer],
});
