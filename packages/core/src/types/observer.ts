import { LimitEventMap, LimitEventName } from './events';

/**
 * A telemetry collector that observes the lifecycle of {@link RateLimiter.consume}.
 *
 * Every handler is optional — a metrics-only collector might implement just
 * `onRuleAllow` / `onRuleReject`, while a tracer implements the full set so it
 * can open a span in `onConsumeStart` / `onRuleStart` and close it in the
 * matching terminal handler.
 *
 * Handlers are invoked synchronously, in registration order, and their return
 * value is ignored (async handlers are **not** awaited). A handler that throws
 * can never abort `consume()`, the rule loop, or the other observers — the
 * error is routed to {@link RateLimitObserver.onObserverError} instead.
 *
 * Register an observer via {@link Limiter.subscribe} or by passing it in
 * {@link RateLimitConfig.observers}.
 */
export interface RateLimitObserver {
  /** Fired once at the start of a `consume()` call, before any rule is evaluated. */
  onConsumeStart?(payload: LimitEventMap['consume.start']): void;

  /** Fired once when every rule allowed the request. */
  onConsumeAllow?(payload: LimitEventMap['consume.allow']): void;

  /** Fired once when a rule rejected the request (limit exceeded). */
  onConsumeReject?(payload: LimitEventMap['consume.reject']): void;

  /**
   * Fired once when a rule failed to evaluate. The original error still
   * propagates out of `consume()` after this handler runs.
   */
  onConsumeError?(payload: LimitEventMap['consume.error']): void;

  /** Fired before each rule is resolved and evaluated. */
  onRuleStart?(payload: LimitEventMap['rule.start']): void;

  /** Fired when a rule evaluated and the request is within its limit. */
  onRuleAllow?(payload: LimitEventMap['rule.allow']): void;

  /** Fired when a rule evaluated and the request exceeded its limit. */
  onRuleReject?(payload: LimitEventMap['rule.reject']): void;

  /**
   * Fired when a rule's `key` / `cost` / `policy` resolver threw, or the store's
   * `consume` call rejected.
   */
  onRuleError?(payload: LimitEventMap['rule.error']): void;

  /**
   * Fired when one of the handlers above throws. Never rethrown into
   * `consume()`. If this handler itself throws, the error is swallowed.
   *
   * @param error - the value thrown by the handler
   * @param eventName - the event whose handler threw
   */
  onObserverError?(error: unknown, eventName: LimitEventName): void;
}
