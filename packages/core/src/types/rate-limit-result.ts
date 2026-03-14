/**
 * Result of a rate limit check for a single request.
 *
 * Indicates whether the request is allowed, the maximum number of requests can be made, how many requests remain in the current
 * window, when the limit resets and how many seconds to wait before retrying.
 */
export interface RateLimitResult {
  /**
   * Whether the request is allowed (true = within limits, false = limit exceeded).
   */
  allowed: boolean;

  /**
   * The maximum number of requests the client can make
   */
  limit: number;

  /**
   * Number of requests remaining in the current rate limit window.
   * When `allowed` is false, this is typically 0.
   */
  remaining: number;

  /**
   * Unix timestamp (in milliseconds) when the rate limit counter fully resets.
   * Useful for implementing client-side backoff strategies.
   */
  reset: number;

  /**
   * If the request is rate limited, suggests how many seconds to wait before retrying.
   * Clients should use exponential backoff and add jitter, rather than strictly following this value.
   * Only present when `allowed` is false.
   */
  retryAfter?: number;
}

/**
 * Extended rate limit result with debug information.
 *
 * Returned when debug mode is enabled on the RateLimiter. Includes details about
 * all evaluated rules and which rule caused the rate limit (if any).
 */
export interface DebugLimitResult extends RateLimitResult {
  /**
   * The name of the rule that caused the rate limit to be exceeded.
   * If the request was allowed, this is null.
   */
  failedRule: string | null;

  /**
   * An array of results from the first rule to the first failed one
   */
  details: (RateLimitResult & { name: string })[];
}
