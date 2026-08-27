import type { Meter, Tracer } from '@opentelemetry/api';

/**
 * Options for {@link otelObserver}.
 */
export interface OtelObserverOptions {
  /**
   * Tracer used for the `limitkit.consume` root span and `limitkit.rule` child
   * spans. Defaults to `trace.getTracer('@limitkit/otel')`.
   */
  tracer?: Tracer;

  /**
   * Meter used for the request counter and duration histograms. Defaults to
   * `metrics.getMeter('@limitkit/otel')`.
   */
  meter?: Meter;

  /**
   * Record the resolved rate-limit key as the `limitkit.key` span attribute.
   *
   * The key is frequently personally identifying (a user id, IP address, or API
   * key) and often high-cardinality, so it is **omitted by default**. Enable
   * this only when you control the key space and your backend can handle it.
   */
  includeKey?: boolean;

  /**
   * When set and {@link OtelObserverOptions.includeKey} is not `true`, the key is
   * passed through this function and the result is recorded as `limitkit.key`.
   * Use it to record a hashed or bucketed key without leaking the raw value.
   */
  hashKey?: (key: string) => string;

  /**
   * Prefix for every metric and span name. Defaults to `"limitkit"`.
   */
  namespace?: string;
}

/**
 * The three terminal outcomes of a rule or `consume()` call, used as the
 * `outcome` attribute on metrics.
 */
export type LimitOutcome = 'allow' | 'reject' | 'error';
