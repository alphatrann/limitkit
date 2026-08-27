// Imported first, for its side effect: it loads .env and registers the global
// OpenTelemetry providers that the OtelObserver in ./limiter binds to.
import './telemetry';

import express from 'express';
import type { RateLimitResult } from '@limitkit/core';
import { limiter, RequestContext } from './limiter';
import { stopTelemetry } from './telemetry';

const app = express();
app.use(express.json());

// Not rate limited — handy for liveness probes.
app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/echo', async (req, res) => {
  const ctx: RequestContext = {
    ip: req.ip ?? 'unknown',
    // Any non-empty key works; unauthenticated callers share one bucket.
    apiKey: req.header('x-api-key') ?? 'anonymous',
  };

  // This call is the whole demo: it emits a `limitkit.consume` span with a
  // child span per rule, plus the request/duration/remaining metrics.
  const result = await limiter.consume(ctx);
  res.set(rateLimitHeaders(result));

  if (!result.allowed) {
    res
      .status(429)
      .set('retry-after', String(retryAfterSeconds(result)))
      .json({ error: 'Too many requests', failedRule: result.failedRule });
    return;
  }

  res.status(200).json({ echo: req.body ?? null });
});

/** `x-ratelimit-*` headers from the rule with the least room left. */
function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const tightest = result.rules.reduce((a, b) =>
    b.remaining < a.remaining ? b : a,
  );
  return {
    'x-ratelimit-limit': String(tightest.limit),
    'x-ratelimit-remaining': String(tightest.remaining),
    'x-ratelimit-reset': String(Math.ceil(tightest.resetAt / 1000)),
  };
}

function retryAfterSeconds(result: RateLimitResult): number {
  const failed = result.rules.find((r) => r.name === result.failedRule);
  const at = failed?.availableAt ?? failed?.resetAt;
  if (!at) return 1;
  return Math.max(1, Math.ceil((at - Date.now()) / 1000));
}

const port = Number(process.env.PORT ?? 3000);
const server = app.listen(port, () => {
  console.log(`observability example listening on http://localhost:${port}`);
  console.log(
    'spans and metrics print to this console; hit /api/echo to generate some.',
  );
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(async () => {
      await stopTelemetry();
      process.exit(0);
    });
  });
}
