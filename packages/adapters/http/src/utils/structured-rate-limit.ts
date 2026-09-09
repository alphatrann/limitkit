import { RateLimitResult } from '@limitkit/core';

/**
 * Serialise a value as an RFC 8941 sf-string: wrapped in DQUOTE with `\` and `"`
 * backslash-escaped. sf-string can only carry printable ASCII, so any other
 * character is dropped — rule names are expected to be simple slugs.
 */
function sfString(value: string): string {
  return `"${value
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')}"`;
}

const resetSeconds = (resetAt: number, now: number): number =>
  Math.max(0, Math.ceil((resetAt - now) / 1000));

const nonNegInt = (n: number): number => Math.max(0, Math.floor(n));

/**
 * The `RateLimit` structured field from
 * {@link https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/ | draft-ietf-httpapi-ratelimit-headers}:
 * one member per evaluated rule, `"<name>";r=<remaining>;t=<seconds-to-reset>`.
 *
 * Unlike the single-policy `RateLimit-Limit` / `RateLimit-Remaining` headers
 * this is lossless — every rule that ran is reported — so a client sees every
 * limit it is subject to rather than just the one that binds first.
 *
 * @returns the field value, or `undefined` when no rule was evaluated
 */
export function toRateLimitField(
  result: RateLimitResult,
  now: number = Date.now(),
): string | undefined {
  if (result.rules.length === 0) return undefined;
  return result.rules
    .map(
      (r) =>
        `${sfString(r.name)};r=${nonNegInt(r.remaining)};t=${resetSeconds(
          r.resetAt,
          now,
        )}`,
    )
    .join(', ');
}

/**
 * The `RateLimit-Policy` structured field: one member per evaluated rule,
 * `"<name>";q=<limit>`.
 *
 * The window parameter (`w`) is omitted — the rule result does not carry the
 * policy window, and rate-based algorithms (token bucket, GCRA, leaky bucket)
 * have no fixed window to report.
 *
 * @returns the field value, or `undefined` when no rule was evaluated
 */
export function toRateLimitPolicyField(
  result: RateLimitResult,
): string | undefined {
  if (result.rules.length === 0) return undefined;
  return result.rules
    .map((r) => `${sfString(r.name)};q=${nonNegInt(r.limit)}`)
    .join(', ');
}
