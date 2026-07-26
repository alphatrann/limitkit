/**
 * Coerce a provider-reported token count into a usable non-negative integer.
 *
 * Providers omit counters on streamed chunks and error responses, and some
 * proxies pass them through as `null` or a string. Charging a rate limit is not
 * worth throwing over, so anything that is not a finite, non-negative number
 * collapses to `0`.
 */
export function toTokenCount(value: unknown): number {
  const count = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(count) || count < 0) return 0;
  return Math.floor(count);
}
