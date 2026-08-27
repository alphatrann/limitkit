import {
  context,
  metrics,
  trace,
  Context,
  Counter,
  Histogram,
  Meter,
  Span,
  SpanStatusCode,
  Tracer,
} from '@opentelemetry/api';
import type {
  ConsumeEvent,
  LimitEventMap,
  RateLimitObserver,
  RateLimitResult,
  RateLimitRuleResult,
  RuleEvent,
  RuleFailure,
} from '@limitkit/core';
import { LimitOutcome, OtelObserverOptions } from './types';

interface ConsumeSpans {
  root: Span;
  rootCtx: Context;
  rule?: Span;
}

/**
 * A {@link RateLimitObserver} that turns `RateLimiter.consume()` lifecycle events
 * into OpenTelemetry spans and metrics.
 *
 * **Traces** — one `limitkit.consume` root span per call, one `limitkit.rule`
 * child span per rule evaluated. Spans are marked `ERROR` when a rule's resolver
 * or the store throws.
 *
 * **Metrics**
 * - `limitkit.requests` (counter) — attributes `rule`, `outcome` (`allow` |
 *   `reject` | `error`).
 * - `limitkit.consume.duration` (histogram, ms) — attribute `outcome`.
 * - `limitkit.rule.remaining` (histogram) — attribute `rule`.
 *
 * The host application owns SDK and exporter wiring; this observer only reads
 * from the global (or supplied) `TracerProvider` / `MeterProvider`.
 *
 * @example
 * ```ts
 * import { RateLimiter } from '@limitkit/core';
 * import { OtelObserver } from '@limitkit/otel';
 *
 * const limiter = new RateLimiter({
 *   store,
 *   rules,
 *   observers: [new OtelObserver()],
 * });
 * ```
 */
export class OtelObserver implements RateLimitObserver {
  private readonly ns: string;
  private readonly tracer: Tracer;
  private readonly includeKey: boolean;
  private readonly hashKey?: (key: string) => string;

  private readonly requests: Counter;
  private readonly consumeDuration: Histogram;
  private readonly ruleRemaining: Histogram;

  /** In-flight spans keyed by request id. */
  private readonly inflight = new Map<string, ConsumeSpans>();

  constructor(options: OtelObserverOptions = {}) {
    this.ns = options.namespace ?? 'limitkit';
    this.tracer = options.tracer ?? trace.getTracer('@limitkit/otel');
    this.includeKey = options.includeKey ?? false;
    this.hashKey = options.hashKey;

    const meter: Meter = options.meter ?? metrics.getMeter('@limitkit/otel');
    this.requests = meter.createCounter(`${this.ns}.requests`, {
      description: 'Rate-limit rule evaluations, tagged by rule and outcome.',
    });
    this.consumeDuration = meter.createHistogram(
      `${this.ns}.consume.duration`,
      {
        description: 'Wall-clock duration of a consume() call.',
        unit: 'ms',
      },
    );
    this.ruleRemaining = meter.createHistogram(`${this.ns}.rule.remaining`, {
      description: 'Quota remaining reported by each evaluated rule.',
    });
  }

  onConsumeStart({ event }: LimitEventMap['consume.start']): void {
    this.guard(() => {
      const root = this.tracer.startSpan(`${this.ns}.consume`, {
        attributes: { 'limitkit.request_id': event.id },
      });
      const rootCtx = trace.setSpan(context.active(), root);
      this.inflight.set(event.id, { root, rootCtx });
    });
  }

  onRuleStart({ event }: LimitEventMap['rule.start']): void {
    this.guard(() => {
      const spans = this.inflight.get(event.id);
      if (!spans) return;
      spans.rule = this.tracer.startSpan(
        `${this.ns}.rule`,
        { attributes: { 'limitkit.rule': event.ruleName } },
        spans.rootCtx,
      );
    });
  }

  onRuleAllow({ event, result }: LimitEventMap['rule.allow']): void {
    this.guard(() => this.finishRule(event, 'allow', { result }));
  }

  onRuleReject({ event, result }: LimitEventMap['rule.reject']): void {
    this.guard(() => this.finishRule(event, 'reject', { result }));
  }

  onRuleError({ event, failure }: LimitEventMap['rule.error']): void {
    this.guard(() => this.finishRule(event, 'error', { failure }));
  }

  onConsumeAllow({
    event,
    result,
    durationMs,
  }: LimitEventMap['consume.allow']): void {
    this.guard(() =>
      this.finishConsume(event, 'allow', durationMs, { result }),
    );
  }

  onConsumeReject({
    event,
    result,
    durationMs,
  }: LimitEventMap['consume.reject']): void {
    this.guard(() =>
      this.finishConsume(event, 'reject', durationMs, { result }),
    );
  }

  onConsumeError({
    event,
    failure,
    durationMs,
  }: LimitEventMap['consume.error']): void {
    this.guard(() =>
      this.finishConsume(event, 'error', durationMs, { failure }),
    );
  }

  /** Telemetry must never break consume(). */
  private guard(fn: () => void): void {
    try {
      fn();
    } catch {
      /* swallow */
    }
  }

  private keyValue(event: RuleEvent): string | undefined {
    if (event.key === undefined) return undefined;
    if (this.includeKey) return event.key;
    if (this.hashKey) return this.hashKey(event.key);
    return undefined;
  }

  private finishRule(
    event: RuleEvent,
    outcome: LimitOutcome,
    payload: { result?: RateLimitRuleResult; failure?: RuleFailure },
  ): void {
    this.endRuleSpan(event, payload);
    this.requests.add(1, { rule: event.ruleName, outcome });
    if (payload.result)
      this.ruleRemaining.record(payload.result.remaining, {
        rule: event.ruleName,
      });
  }

  private endRuleSpan(
    event: RuleEvent,
    payload: { result?: RateLimitRuleResult; failure?: RuleFailure },
  ): void {
    const spans = this.inflight.get(event.id);
    const span = spans?.rule;
    if (!spans || !span) return;
    spans.rule = undefined;

    span.setAttribute('limitkit.rule', event.ruleName);
    if (event.cost !== undefined)
      span.setAttribute('limitkit.cost', event.cost);
    if (event.policy?.name)
      span.setAttribute('limitkit.policy', event.policy.name);

    const key = this.keyValue(event);
    if (key !== undefined) span.setAttribute('limitkit.key', key);

    if (payload.result) {
      span.setAttribute('limitkit.allowed', payload.result.allowed);
      span.setAttribute('limitkit.remaining', payload.result.remaining);
      span.setAttribute('limitkit.limit', payload.result.limit);
    }
    if (payload.failure) {
      span.recordException(payload.failure.error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: payload.failure.error.message,
      });
    }
    span.end();
  }

  private finishConsume(
    event: ConsumeEvent,
    outcome: LimitOutcome,
    durationMs: number,
    payload: { result?: RateLimitResult; failure?: RuleFailure },
  ): void {
    this.consumeDuration.record(durationMs, { outcome });

    const spans = this.inflight.get(event.id);
    if (!spans) return;
    this.inflight.delete(event.id);

    // Defensive: close a rule span still open if consume.error raced ahead.
    if (spans.rule) {
      spans.rule.end();
      spans.rule = undefined;
    }

    const { root } = spans;
    root.setAttribute('limitkit.rule_count', event.ruleCount);
    if (payload.result) {
      root.setAttribute('limitkit.allowed', payload.result.allowed);
      if (payload.result.failedRule)
        root.setAttribute('limitkit.failed_rule', payload.result.failedRule);
    }
    if (payload.failure) {
      root.recordException(payload.failure.error);
      root.setStatus({
        code: SpanStatusCode.ERROR,
        message: payload.failure.error.message,
      });
    }
    root.end();
  }
}

/**
 * Convenience factory for {@link OtelObserver} — `otelObserver(opts)` is exactly
 * `new OtelObserver(opts)`.
 */
export function otelObserver(options?: OtelObserverOptions): RateLimitObserver {
  return new OtelObserver(options);
}
