import { RateLimitConfig } from "@limitkit/core";
import { Request } from "express";

/**
 * Represents route-level configuration
 *
 * Route-level configuration overrides global configuration
 *
 * @extends Partial<RateLimitConfig<Request>>
 */
export interface RouteRateLimitConfig extends Partial<
  RateLimitConfig<Request>
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
