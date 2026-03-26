import { RateLimitHeaders } from "../types";
import { mostRestrictive } from "./most-restrictive";
import { RateLimitResult } from "@limitkit/core";

/**
 * Derive HTTP rate limit headers from a {@link RateLimitResult}.
 *
 * When the request is allowed, headers are derived from the most restrictive rule.
 * When the request is rejected, headers are derived from the rule that caused the rejection.
 *
 * See {@link mostRestrictive} for how the governing rule is selected.
 *
 * @param result - Rate limiting evaluation result
 * @returns Rate limit headers suitable for HTTP responses (e.g., Express `res.setHeader`)
 */
export function toRateLimitHeaders(result: RateLimitResult): RateLimitHeaders {
  const rule = result.allowed
    ? mostRestrictive(result)!
    : result.rules.find((r) => r.name === result.failedRule)!;
  const now = Date.now();

  const resetSeconds = Math.ceil((rule.resetAt - now) / 1000);
  const retrySeconds = rule.availableAt
    ? Math.ceil((rule.availableAt - now) / 1000)
    : undefined;

  return {
    "RateLimit-Limit": rule.limit,
    "RateLimit-Remaining": rule.remaining,
    "Reset-After": resetSeconds,
    ...(retrySeconds ? { "Retry-After": retrySeconds } : {}),
  };
}
