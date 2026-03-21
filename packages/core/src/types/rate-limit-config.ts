import { LimitRule } from "./limit-rule";
import { Store } from "./store";

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
}
