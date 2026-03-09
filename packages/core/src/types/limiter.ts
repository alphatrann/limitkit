import { RateLimitResult } from "./rate-limit-result";

/**
 * Interface for a rate limiter that enforces rate limit rules.
 *
 * @template C The context type passed to the limiter to determine dynamic rule values.
 */
export interface Limiter<C> {
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
}
