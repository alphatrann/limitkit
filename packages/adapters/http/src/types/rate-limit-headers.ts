/**
 * Standard RFC header objects in rate limiting.
 *
 * Every field is optional: when no rule governed the request (all rules were
 * skipped by a falsy `when` predicate) {@link toRateLimitHeaders} returns an
 * empty object.
 */
export interface RateLimitHeaders {
  /**
   * The maximum number of requests allowed
   */
  'RateLimit-Limit'?: number;

  /**
   * The number of requests remaining that the client can send
   */
  'RateLimit-Remaining'?: number;

  /**
   * Seconds to wait until the limit fully resets
   */
  'Reset-After'?: number;

  /**
   * Seconds to wait until the next allowed request.
   * Only defined when the request is **rejected**.
   */
  'Retry-After'?: number;
}
