import { RateLimitResult, IdentifiedRateLimitRuleResult } from '@limitkit/core';

/**
 * Select the rule that binds a request first — the one a client will hit before
 * any other.
 *
 * Ordered by:
 * 1. lowest `remaining` (fewest requests left before a 429), then
 * 2. latest `resetAt` (frees up last, so the more conservative choice), then
 * 3. lowest `limit` (tighter cap).
 *
 * `remaining` is compared in absolute terms, not as a `remaining / limit` ratio:
 * a client is blocked by whichever rule runs out of quota first, and a large
 * global limit with lots of headroom should not mask a small per-user limit
 * that is nearly spent.
 *
 * Used to fill the single-policy `RateLimit-Limit` / `RateLimit-Remaining` /
 * `Reset-After` headers. Rules with different window sizes are not strictly
 * comparable this way (3 left resetting in 1s is a weaker constraint than 5 left
 * resetting in 1h); the per-policy `RateLimit` / `RateLimit-Policy` fields carry
 * the full picture without a heuristic.
 *
 * @param result - Rate limiting evaluation result
 * @returns The binding rule, or `null` if no rules were evaluated
 */
export function mostRestrictive(
  result: RateLimitResult,
): IdentifiedRateLimitRuleResult | null {
  return result.rules.reduce<IdentifiedRateLimitRuleResult | null>(
    (worst, rule) => {
      if (!worst) return rule;
      if (rule.remaining !== worst.remaining)
        return rule.remaining < worst.remaining ? rule : worst;
      if (rule.resetAt !== worst.resetAt)
        return rule.resetAt > worst.resetAt ? rule : worst;
      return rule.limit < worst.limit ? rule : worst;
    },
    null,
  );
}
