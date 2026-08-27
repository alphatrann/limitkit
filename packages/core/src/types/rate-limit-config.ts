import { LimitRule } from './limit-rule';
import { RateLimitObserver } from './observer';
import { Store } from './store';

/**
 * Represents a configuration object for the rate limiter
 */
export interface RateLimitConfig<C = unknown> {
  /**
   * A set of rate limiting rules to apply.
   */

  rules: LimitRule<C>[];

  /**
   * The storage backend for tracking rate limit state.
   */
  store: Store;

  /**
   * Telemetry collectors notified of `consume()` lifecycle events.
   *
   * Registering observers here (rather than only via {@link Limiter.subscribe})
   * ensures they survive when an adapter rebuilds the limiter per request from
   * {@link RateLimiter.config}.
   */
  observers?: RateLimitObserver[];
}
