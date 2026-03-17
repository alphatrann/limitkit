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
 * Route-specific configuration may provide additional rate-limit rules.
 * These rules are merged with the base limiter rules using {@link mergeRules}.
 * The underlying limiter infrastructure (store, debug settings, etc.)
 * cannot be overridden at the route level.
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
 * import { limit } from "@limitkit/express";
 * import { RateLimiter } from "@limitkit/core";
 * import { InMemoryStore, InMemoryFixedWindow } from "@limitkit/memory";
 *
 * const limiter = new RateLimiter({
 *   rules: [new InMemoryFixedWindow({ name: "fixed-window", limit: 100, window: 60 })],
 *   store: new InMemoryStore(),
 * });
 *
 * app.get("/api", limit(limiter), handler);
 * ```
 *
 * @example
 * Route-specific limits
 *
 * ```ts
 * app.post(
 *   "/login",
 *   limit(limiter, {
 *     rules: [new InMemoryFixedWindow({ name: "fixed-window", limit: 5, window: 60 })]
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
  }: RouteRateLimitConfig = {},
) {
  const limiterConfig = limiter.config;
  const mergedRules = routeConfig.rules
    ? mergeRules(limiterConfig.rules, routeConfig.rules)
    : limiterConfig.rules;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await new RateLimiter({
        ...limiter.config,
        rules: mergedRules,
      }).consume(req);

      res.setHeader("RateLimit-Limit", result.limit);
      res.setHeader("RateLimit-Remaining", result.remaining);
      res.setHeader(
        "RateLimit-Reset",
        Math.ceil((result.reset - Date.now()) / 1000),
      );

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
