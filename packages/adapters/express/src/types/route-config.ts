import { RateLimitConfig } from "@limitkit/core";
import { Request } from "express";

/**
 * Route-level rate limit configuration.
 *
 * Additional rules provided here are merged with the base limiter rules
 * using {@link mergeRules}. The underlying store and global limiter
 * configuration remain unchanged.
 */
export interface RouteRateLimitConfig extends Partial<
  Pick<RateLimitConfig<Request>, "rules">
> {
  /**
   * Custom rate limit response (optional)
   *
   * Default response:
   * ```json
   * {
   *   "status": 429,
   *   "error": "Too many requests",
   * }
   */
  rateLimitResponse?: Record<string, any>;
}
