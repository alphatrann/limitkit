import { config } from 'dotenv';
import { metrics, trace } from '@opentelemetry/api';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ConsoleMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import {
  BasicTracerProvider,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

// Load .env before anything reads process.env. This module is imported first
// (see index.ts), so this is the earliest hook available.
config({ override: true, quiet: true });

let tracerProvider: BasicTracerProvider | undefined;
let meterProvider: MeterProvider | undefined;

/**
 * Stand up a minimal OpenTelemetry pipeline and register it as the global
 * `TracerProvider` / `MeterProvider`.
 *
 * `new OtelObserver()` binds to those globals when it is constructed, which is
 * why this module is imported — and runs — before `./limiter`. LimitKit never
 * touches an exporter directly.
 *
 * This example prints spans and metrics to the console so it runs with no
 * collector, no Prometheus, no network. Moving to OTLP or the Prometheus
 * exporter (see the README) changes this file only; `limiter.ts` does not move.
 */
export function startTelemetry(): void {
  if (tracerProvider) return;

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]:
      process.env.OTEL_SERVICE_NAME ?? 'limitkit-observability-example',
  });

  tracerProvider = new BasicTracerProvider({
    resource,
    spanProcessors: [new SimpleSpanProcessor(new ConsoleSpanExporter())],
  });
  trace.setGlobalTracerProvider(tracerProvider);

  meterProvider = new MeterProvider({
    resource,
    readers: [
      new PeriodicExportingMetricReader({
        exporter: new ConsoleMetricExporter(),
        exportIntervalMillis: Number(
          process.env.OTEL_METRIC_EXPORT_INTERVAL ?? 10_000,
        ),
      }),
    ],
  });
  metrics.setGlobalMeterProvider(meterProvider);
}

/** Flush and shut the pipeline down so nothing buffered is lost on exit. */
export async function stopTelemetry(): Promise<void> {
  await Promise.all([tracerProvider?.shutdown(), meterProvider?.shutdown()]);
  tracerProvider = undefined;
  meterProvider = undefined;
}

// Run on import, before the OtelObserver in ./limiter is constructed.
startTelemetry();
