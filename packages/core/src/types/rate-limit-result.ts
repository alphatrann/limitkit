/**
 * Result of evaluating a single rate limit rule.
 *
 * Represents the state of one rule (e.g., per-IP, per-user).
 */
export interface RateLimitRuleResult {
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
  resetAt: number;

  /**
   * If the request is rate limited, suggests the timestamp to retry.
   * Defined only present when `allowed` is false.
   *
   * In traffic shaping leaky bucket, it is defined when `allowed` is true, which indicates
   * the earliest time the request can safely run.
   */
  availableAt?: number;
}

export interface IdentifiedRateLimitRuleResult extends RateLimitRuleResult {
  /**
   * Unique name of the rule.
   */
  name: string;
}

/**
 * Result of a rate limit check across all rules.
 *
 * This is a composable, lossless representation of all evaluated rules.
 * No aggregation or interpretation is applied at this level.
 */
export interface RateLimitResult {
  /**
   * Whether the request is allowed across all rules.
   * Equivalent to: all(rule.allowed === true)
   */
  allowed: boolean;

  /**
   * The name of the rule that caused the rejection.
   * Null if the request was allowed.
   */
  failedRule: string | null;

  /**
   * Results for each evaluated rule, in order.
   */
  rules: IdentifiedRateLimitRuleResult[];
}
