/**
 * @description represents the result of a rate limit check.
 */
export interface RateLimitResult {
  allowed: boolean;

  /**
   * @description number of requests remaining
   * */
  remaining: number;

  /**
   * @description Unix timestamp when the limit fully resets in milliseconds
   */
  reset: number;

  /**
   * @description how long to wait before making a follow-up request in seconds
   */
  retryAfter?: number;
}

/**
 * @description represents the result of rate limit check in debugging mode
 */
export interface DebugLimitResult extends RateLimitResult {
  /**
   * @description the name of rule at which the limit is exceeded
   */
  failedRule: string | null;

  /**
   * @description all the results of the first rule to the first failed one
   */
  details: (RateLimitResult & { name: string })[];
}
