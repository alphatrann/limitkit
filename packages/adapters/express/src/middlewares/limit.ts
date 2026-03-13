import { mergeRules, RateLimiter } from "@limitkit/core";
import { NextFunction, Request, Response } from "express";
import { RouteRateLimitConfig } from "../types";

const defaultRateLimitResponse = {
  status: 429,
  error: "Too many requests",
};

/**
 * Creates an Express middleware that applies rate limiting using a {@link RateLimiter}.
 *
 * This middleware consumes a request from the provided limiter and determines whether
 * the request is allowed based on the configured rate-limit rules. If the request exceeds
 * the allowed limit, the middleware responds with HTTP `429 Too Many Requests`.
 *
 * The middleware also attaches standard rate-limit headers to the response:
 *
 * - `RateLimit-Limit` — Maximum number of requests allowed in the window
 * - `RateLimit-Remaining` — Remaining requests in the current window
 * - `RateLimit-Reset` — Time (in seconds) until the limit resets
 * - `Retry-After` — Time (in seconds) the client should wait before retrying (only when limited)
 *
 * Route-specific configuration can override the base limiter configuration such as
 * rules, store, and debug mode. Rules are merged using {@link mergeRules}.
 *
 * @template Request
 *
 * @param limiter
 * The base {@link RateLimiter} instance used to enforce rate limiting.
 * This typically contains global rules and a backing store (e.g., memory, Redis).
 *
 * @param config
 * Route-level configuration used to override limiter behavior.
 *
 * @param config.rules
 * Optional rate-limit rules specific to this route. These are merged with the
 * base limiter rules using {@link mergeRules}.
 *
 * @param config.store
 * Optional store override for this route. If omitted, the base limiter store is used.
 *
 * @param config.debug
 * Enables debug logging for this route limiter.
 *
 * @param config.rateLimitResponse
 * Custom JSON response body returned when the rate limit is exceeded.
 * Defaults to:
 *
 * ```json
 * {
 *   "status": 429,
 *   "error": "Too many requests"
 * }
 * ```
 *
 * @returns
 * An Express middleware function that enforces rate limiting.
 *
 * @example
 * Basic usage
 *
 * ```ts
 * const limiter = new RateLimiter({
 *   rules: [{ limit: 100, window: "1m" }],
 *   store: new MemoryStore(),
 * });
 *
 * app.get("/api", limit(limiter, {}), handler);
 * ```
 *
 * @example
 * Route-specific limits
 *
 * ```ts
 * app.post(
 *   "/login",
 *   limit(limiter, {
 *     rules: [{ limit: 5, window: "1m" }]
 *   }),
 *   loginHandler
 * );
 * ```
 *
 * @example
 * Custom response
 *
 * ```ts
 * app.get(
 *   "/api",
 *   limit(limiter, {
 *     rateLimitResponse: {
 *       error: "Rate limit exceeded",
 *       code: "RATE_LIMITED"
 *     }
 *   }),
 *   handler
 * );
 * ```
 *
 * @see RateLimiter
 * @see mergeRules
 */
export function limit(
  limiter: RateLimiter<Request>,
  {
    rateLimitResponse = defaultRateLimitResponse,
    ...routeConfig
  }: RouteRateLimitConfig,
) {
  const limiterConfig = limiter.config;
  const routeLimiter = new RateLimiter<Request>(limiterConfig);
  if (routeConfig)
    routeLimiter.config = {
      debug: routeConfig.debug ?? limiterConfig.debug,
      rules: mergeRules(limiterConfig.rules, routeConfig.rules),
      store: routeConfig.store ?? limiterConfig.store,
    };

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await routeLimiter.consume(req);

      res.setHeader("RateLimit-Limit", result.limit);
      res.setHeader("RateLimit-Remaining", result.remaining);
      res.setHeader("RateLimit-Reset", result.reset);

      if (!result.allowed) {
        res.setHeader("Retry-After", result.retryAfter ?? 0);
        return res.status(429).json(rateLimitResponse);
      }

      next();
    } catch (err) {
      console.error(err);
      next(err);
    }
  };
}
