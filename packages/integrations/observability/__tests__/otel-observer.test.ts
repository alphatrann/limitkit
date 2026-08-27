import { RateLimiter } from '@limitkit/core';
import { InMemoryStore, fixedWindow } from '@limitkit/memory';
import { SpanStatusCode } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  ReadableSpan,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { OtelObserver, otelObserver } from '../src';
import type { OtelObserverOptions } from '../src';

const parentIdOf = (span: ReadableSpan): string | undefined =>
  span.parentSpanContext?.spanId ??
  (span as unknown as { parentSpanId?: string }).parentSpanId;

interface Harness {
  spanExporter: InMemorySpanExporter;
  metricExporter: InMemoryMetricExporter;
  meterProvider: MeterProvider;
  observer: OtelObserver;
}

const makeHarness = (options: OtelObserverOptions = {}): Harness => {
  const spanExporter = new InMemorySpanExporter();
  const tracerProvider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(spanExporter)],
  });

  const metricExporter = new InMemoryMetricExporter(
    AggregationTemporality.CUMULATIVE,
  );
  const reader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 60_000,
  });
  const meterProvider = new MeterProvider({ readers: [reader] });

  const observer = new OtelObserver({
    tracer: tracerProvider.getTracer('test'),
    meter: meterProvider.getMeter('test'),
    ...options,
  });

  return { spanExporter, metricExporter, meterProvider, observer };
};

const collectPoints = async (h: Harness, name: string) => {
  await h.meterProvider.forceFlush();
  const points: Array<{ value: number; attributes: Record<string, unknown> }> =
    [];
  for (const rm of h.metricExporter.getMetrics()) {
    for (const sm of rm.scopeMetrics) {
      for (const metric of sm.metrics) {
        if (metric.descriptor.name !== name) continue;
        for (const dp of metric.dataPoints) {
          const value =
            typeof dp.value === 'number'
              ? dp.value
              : (dp.value as { count: number }).count;
          points.push({ value, attributes: dp.attributes });
        }
      }
    }
  }
  return points;
};

const makeLimiter = (h: Harness, store = new InMemoryStore()) =>
  new RateLimiter<{ id: string }>({
    store,
    rules: [
      {
        name: 'per-user',
        key: (ctx) => ctx.id,
        policy: fixedWindow({ window: 60, limit: 2 }),
      },
      {
        name: 'per-ip',
        key: () => 'ip:1.2.3.4',
        policy: fixedWindow({ window: 60, limit: 5 }),
      },
    ],
    observers: [h.observer],
  });

describe('otelObserver', () => {
  it('emits one root span and one child span per rule for an allowed request', async () => {
    const h = makeHarness();
    await makeLimiter(h).consume({ id: 'u1' });

    const spans = h.spanExporter.getFinishedSpans();
    const root = spans.find((s) => s.name === 'limitkit.consume')!;
    const rules = spans.filter((s) => s.name === 'limitkit.rule');

    expect(root).toBeDefined();
    expect(rules).toHaveLength(2);
    expect(parentIdOf(root)).toBeUndefined();
    for (const rule of rules) {
      expect(parentIdOf(rule)).toBe(root.spanContext().spanId);
    }
    expect(rules[0].attributes['limitkit.rule']).toBe('per-user');
    expect(rules[0].attributes['limitkit.allowed']).toBe(true);
    expect(rules[0].attributes['limitkit.policy']).toBe('fixed-window');
    expect(root.attributes['limitkit.allowed']).toBe(true);
    expect(root.status.code).not.toBe(SpanStatusCode.ERROR);
  });

  it('counts requests by rule and outcome', async () => {
    const h = makeHarness();
    await makeLimiter(h).consume({ id: 'u1' });

    const points = await collectPoints(h, 'limitkit.requests');
    const perUser = points.find((p) => p.attributes.rule === 'per-user')!;
    const perIp = points.find((p) => p.attributes.rule === 'per-ip')!;

    expect(perUser).toMatchObject({
      value: 1,
      attributes: { outcome: 'allow' },
    });
    expect(perIp).toMatchObject({ value: 1, attributes: { outcome: 'allow' } });
  });

  it('marks the failing rule span and counts a reject when the limit is exceeded', async () => {
    const h = makeHarness();
    const limiter = makeLimiter(h);

    await limiter.consume({ id: 'u1' });
    await limiter.consume({ id: 'u1' });
    const rejected = await limiter.consume({ id: 'u1' }); // per-user limit = 2

    expect(rejected.allowed).toBe(false);
    expect(rejected.failedRule).toBe('per-user');

    const rejectSpan = h.spanExporter
      .getFinishedSpans()
      .filter((s) => s.name === 'limitkit.rule')
      .find((s) => s.attributes['limitkit.allowed'] === false)!;
    expect(rejectSpan.attributes['limitkit.rule']).toBe('per-user');

    const points = await collectPoints(h, 'limitkit.requests');
    expect(
      points.find(
        (p) =>
          p.attributes.rule === 'per-user' && p.attributes.outcome === 'reject',
      )?.value,
    ).toBe(1);
  });

  it('marks spans ERROR and counts an error outcome when the store throws, and consume() still rejects', async () => {
    const h = makeHarness();
    const boom = new Error('store offline');
    const store = new InMemoryStore();
    jest.spyOn(store, 'consume').mockRejectedValue(boom);

    const limiter = makeLimiter(h, store);
    await expect(limiter.consume({ id: 'u1' })).rejects.toBe(boom);

    const spans = h.spanExporter.getFinishedSpans();
    const root = spans.find((s) => s.name === 'limitkit.consume')!;
    const rule = spans.find((s) => s.name === 'limitkit.rule')!;
    expect(rule.status.code).toBe(SpanStatusCode.ERROR);
    expect(root.status.code).toBe(SpanStatusCode.ERROR);
    expect(rule.events.some((e) => e.name === 'exception')).toBe(true);

    const points = await collectPoints(h, 'limitkit.requests');
    expect(points.find((p) => p.attributes.outcome === 'error')?.value).toBe(1);
  });

  it('omits the key attribute by default and records a hashed key when hashKey is set', async () => {
    const plain = makeHarness();
    await makeLimiter(plain).consume({ id: 'secret-user' });
    const plainRule = plain.spanExporter
      .getFinishedSpans()
      .find((s) => s.name === 'limitkit.rule')!;
    expect(plainRule.attributes['limitkit.key']).toBeUndefined();

    const hashed = makeHarness({ hashKey: (k) => `h:${k.length}` });
    await makeLimiter(hashed).consume({ id: 'secret-user' });
    const hashedRule = hashed.spanExporter
      .getFinishedSpans()
      .find(
        (s) =>
          s.name === 'limitkit.rule' &&
          s.attributes['limitkit.rule'] === 'per-user',
      )!;
    expect(hashedRule.attributes['limitkit.key']).toBe('h:11');
  });

  it('records the raw key when includeKey is true', async () => {
    const h = makeHarness({ includeKey: true });
    await makeLimiter(h).consume({ id: 'u1' });
    const rule = h.spanExporter
      .getFinishedSpans()
      .find(
        (s) =>
          s.name === 'limitkit.rule' &&
          s.attributes['limitkit.rule'] === 'per-user',
      )!;
    expect(rule.attributes['limitkit.key']).toBe('u1');
  });

  it('does not leak spans across calls', async () => {
    const h = makeHarness();
    const limiter = makeLimiter(h);

    for (let i = 0; i < 5; i++) await limiter.consume({ id: `u${i}` });

    const roots = h.spanExporter
      .getFinishedSpans()
      .filter((s) => s.name === 'limitkit.consume');
    const rules = h.spanExporter
      .getFinishedSpans()
      .filter((s) => s.name === 'limitkit.rule');
    expect(roots).toHaveLength(5);
    expect(rules).toHaveLength(10);
    expect(roots.every((s) => s.endTime[0] > 0)).toBe(true);
  });

  it('records consume duration by outcome', async () => {
    const h = makeHarness();
    await makeLimiter(h).consume({ id: 'u1' });

    const points = await collectPoints(h, 'limitkit.consume.duration');
    expect(points).toHaveLength(1);
    expect(points[0].attributes).toMatchObject({ outcome: 'allow' });
    expect(points[0].value).toBeGreaterThanOrEqual(1); // histogram count
  });

  it('otelObserver() is an alias for new OtelObserver()', () => {
    expect(otelObserver()).toBeInstanceOf(OtelObserver);
  });
});
