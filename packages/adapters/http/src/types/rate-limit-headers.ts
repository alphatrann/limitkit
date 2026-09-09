/**
 * HTTP rate-limit response headers.
 *
 * Two representations that a client can use interchangeably:
 *
 * - `RateLimit` / `RateLimit-Policy` — the per-policy structured fields from
 *   draft-ietf-httpapi-ratelimit-headers, one member per evaluated rule.
 * - `RateLimit-Limit` / `RateLimit-Remaining` / `Reset-After` / `Retry-After` —
 *   the individual headers, derived from the single governing rule.
 *
 * Every field is optional: when no rule governed the request (all rules were
 * skipped by a falsy `when` predicate) {@link toRateLimitHeaders} returns an
 * empty object.
 */
export interface RateLimitHeaders {
  /**
   * Per-policy quota state, one list member per evaluated rule:
   * `"<name>";r=<remaining>;t=<seconds-to-reset>`.
   */
  RateLimit?: string;

  /**
   * Per-policy quota definition, one list member per evaluated rule:
   * `"<name>";q=<limit>`. The window parameter (`w`) is not emitted.
   */
  'RateLimit-Policy'?: string;

  /**
   * The maximum number of requests allowed, for the governing rule.
   */
  'RateLimit-Limit'?: number;

  /**
   * The number of requests remaining that the client can send, for the
   * governing rule.
   */
  'RateLimit-Remaining'?: number;

  /**
   * Seconds to wait until the governing rule's limit fully resets.
   */
  'Reset-After'?: number;

  /**
   * Seconds to wait until the next allowed request.
   * Only defined when the request is **rejected**.
   */
  'Retry-After'?: number;
}
