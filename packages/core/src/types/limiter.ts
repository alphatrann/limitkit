import { RateLimitObserver } from './observer';
import { RateLimitResult } from './rate-limit-result';

/**
 * Interface for a rate limiter that enforces rate limit rules.
 *
 * @template C The context type passed to the limiter to determine dynamic rule values.
 */
export interface Limiter<C = unknown> {
  /**
   * Check if a request is allowed under the configured rate limits.
   *
   * Evaluates all configured rules in order and returns the result of the first rule
   * that limits the request. If all rules allow the request, returns a positive result.
   *
   * @param ctx - Context object containing information about the request (e.g., user ID, IP address).
   *              Used to dynamically determine rule keys, costs, and policies.
   * @returns A promise that resolves to the result of the rate limit check, including
   *          whether the request is allowed and when the limit resets.
   */
  consume(ctx: C): Promise<RateLimitResult>;

  /**
   * Report whether `consume(ctx)` would succeed right now, without consuming.
   *
   * Evaluates every rule (no short-circuit) against read-only store state and
   * returns the same shape as {@link Limiter.consume}. Emits no lifecycle events.
   *
   * @param ctx - Context object, as for `consume`.
   * @throws if the underlying store does not support peeking
   */
  peek(ctx: C): Promise<RateLimitResult>;

  /**
   * Register a telemetry collector for `consume()` lifecycle events.
   *
   * @param observer - the collector to notify
   * @returns a function that removes the observer when called
   */
  subscribe(observer: RateLimitObserver): () => void;
}
