/**
 * Standard RFC header objects in rate limiting
 */
export interface RateLimitHeaders {
  /**
   * The maximum number of requests allowed
   */
  "RateLimit-Limit": number;

  /**
   * The number of requests remaining that the client can send
   */
  "RateLimit-Remaining": number;

  /**
   * Seconds to wait until the limit fully resets
   */
  "RateLimit-Reset": number;

  /**
   * Seconds to wait until the next allowed request.
   * Only defined when the request is **rejected**.
   */
  "Retry-After"?: number;
}
