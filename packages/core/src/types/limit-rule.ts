import { Algorithm } from "./algorithm";
import { AlgorithmConfig } from "./algorithm-config";

/**
 * Defines a single rate limiting rule with its associated algorithm and constraints.
 *
 * Rules are evaluated in order, and the rate limiter returns the result of the first
 * rule that reaches its limit. This allows for layered rate limiting (e.g., per-user
 * and per-IP limits simultaneously).
 *
 * @template C The context type used to dynamically determine rule parameters.
 */
export interface LimitRule<C = unknown> {
  /**
   * Unique name/identifier for this rule, used for tracking which rule caused a rate limit.
   * Appears in debug results when the rule is exceeded.
   */
  name: string;

  /**
   * The rate limiting key that groups requests together.
   *
   * Can be:
   * - A **fixed string**: All requests use the same limit (e.g., "global-api-limit")
   * - A **function**: Dynamically determines the key per request (e.g., extract user ID from context)
   * - An **async function**: For async key resolution (e.g., lookup user tier from database)
   *
   * Example: `(ctx) => ctx.userId` to apply per-user rate limits
   */
  key: string | ((ctx: C) => string | Promise<string>);

  /**
   * Optional cost/weight of each request. Defaults to 1 if not specified.
   *
   * Can be:
   * - A **fixed number**: Every request costs the same (e.g., 1)
   * - A **function**: Different requests have different costs (e.g., expensive operations cost more)
   * - An **async function**: For async cost calculation
   *
   * Useful for implementing tiered request costs where some operations are more resource-intensive
   * and should count as multiple requests against the rate limit.
   */
  cost?: number | ((ctx: C) => number | Promise<number>);

  /**
   * The rate limiting algorithm and its configuration.
   *
   * Can be:
   * - A **fixed policy**: Same algorithm for all requests (e.g., 100 requests per minute)
   * - A **function**: Dynamically choose algorithm per request (e.g., stricter limits for free tier users)
   * - An **async function**: For async policy resolution (e.g., fetch limits from a service)
   */
  policy: PolicyResolver<C>;
}

/**
 * Resolver function type for rate limit policies.
 */
type PolicyResolver<C> =
  | Algorithm<AlgorithmConfig>
  | ((
      ctx: C,
    ) => Algorithm<AlgorithmConfig> | Promise<Algorithm<AlgorithmConfig>>);
