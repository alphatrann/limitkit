import { RateLimitResult, IdentifiedRateLimitRuleResult } from "@limitkit/core";

/**
 * Select the most restrictive rule from a set of evaluated rules.
 *
 * The most restrictive rule is defined as:
 * - The rule with the lowest ratio of `remaining / limit`
 * - If equal, the rule with the later `resetAt`
 *
 * This is typically used to derive consistent HTTP headers when multiple
 * rate limit rules are applied simultaneously.
 *
 * @param result - Rate limiting evaluation result
 * @returns The most restrictive rule, or null if no rules are present
 */
export function mostRestrictive(
  result: RateLimitResult,
): IdentifiedRateLimitRuleResult | null {
  return result.rules.reduce(
    (worst: IdentifiedRateLimitRuleResult | null, rule) => {
      if (!worst) return rule;

      const score = rule.remaining / rule.limit;
      const worstScore = worst.remaining / worst.limit;

      if (score < worstScore) return rule;
      if (score === worstScore && rule.resetAt > worst.resetAt) return rule;

      return worst;
    },
    null,
  );
}
