import { RateLimitHeaders } from '../types';
import { mostRestrictive } from './most-restrictive';
import {
  toRateLimitField,
  toRateLimitPolicyField,
} from './structured-rate-limit';
import { RateLimitResult } from '@limitkit/core';

/**
 * Derive HTTP rate limit headers from a {@link RateLimitResult}.
 *
 * Two representations are emitted together:
 *
 * - **Per-policy** (`RateLimit`, `RateLimit-Policy`) — the structured fields
 *   from draft-ietf-httpapi-ratelimit-headers, with one member per evaluated
 *   rule. Lossless: a client sees every limit it is subject to.
 * - **Single-policy** (`RateLimit-Limit`, `RateLimit-Remaining`, `Reset-After`,
 *   and `Retry-After` on a rejection) — the widely-supported individual
 *   headers, derived from one governing rule. On an allowed request that rule
 *   is the one that binds first (see {@link mostRestrictive}); on a rejection
 *   it is the rule that caused it.
 *
 * When no rule governed the request — every rule was skipped by a falsy `when`
 * predicate, so `result.rules` is empty — an empty object is returned.
 *
 * @param result - Rate limiting evaluation result
 * @returns Rate limit headers suitable for HTTP responses (e.g., Express `res.setHeader`)
 */
export function toRateLimitHeaders(result: RateLimitResult): RateLimitHeaders {
  const rule = result.allowed
    ? mostRestrictive(result)
    : (result.rules.find((r) => r.name === result.failedRule) ?? null);

  if (!rule) return {};

  const now = Date.now();

  const resetSeconds = Math.ceil((rule.resetAt - now) / 1000);
  const retrySeconds = rule.availableAt
    ? Math.ceil((rule.availableAt - now) / 1000)
    : undefined;

  const rateLimit = toRateLimitField(result, now);
  const rateLimitPolicy = toRateLimitPolicyField(result);

  return {
    'RateLimit-Limit': rule.limit,
    'RateLimit-Remaining': rule.remaining,
    'Reset-After': resetSeconds,
    ...(retrySeconds ? { 'Retry-After': retrySeconds } : {}),
    ...(rateLimit ? { RateLimit: rateLimit } : {}),
    ...(rateLimitPolicy ? { 'RateLimit-Policy': rateLimitPolicy } : {}),
  };
}
