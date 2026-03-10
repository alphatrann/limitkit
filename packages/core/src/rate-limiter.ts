import { EmptyRulesException } from "./exceptions";
import {
  DebugLimitResult,
  Limiter,
  LimitRule,
  RateLimitResult,
  Store,
} from "./types";

/**
 * Core rate limiter implementation that enforces rate limiting rules.
 *
 * The RateLimiter evaluates rules in order and returns the result of the first rule
 * that limits the request. If all rules allow the request, it returns a positive result.
 *
 * Use cases:
 * - API rate limiting (requests per second/minute)
 * - Preventing brute force attacks
 * - Protecting backend resources from traffic spikes
 * - Multi-tier rate limiting (e.g., per-user AND per-IP limits simultaneously)
 *
 * @template C The context type that contains information about each request.
 *             Passed to rule resolvers to dynamically determine keys, costs, and policies.
 *
 * @example
 * ```typescript
 * const limiter = new RateLimiter({
 *   store: redisStore,
 *   rules: [
 *     {
 *       name: 'per-user-limit',
 *       key: (ctx) => ctx.userId,
 *       policy: { name: 'fixed-window', window: 60, limit: 100 }
 *     }
 *   ]
 * });
 *
 * const result = await limiter.consume({ userId: 'user-123' });
 * if (!result.allowed) {
 *   return 429 with headers: Retry-After: result.retryAfter
 * }
 * ```
 */
export class RateLimiter<C> implements Limiter<C> {
  private rules: LimitRule<C>[] = [];
  private debug: boolean = false;
  private store: Store;

  /**
   * Create a new rate limiter instance.
   *
   * @param config - Configuration for the rate limiter
   * @param config.store - Required. The storage backend for tracking rate limit state.
   * @param config.rules - Required. Initial set of rate limiting rules to apply.
   *                       Can be updated later via direct access or new instances.
   * @param config.debug - Optional. When true, returns detailed information about
   *                       each evaluated rule. Useful for troubleshooting. Defaults to false.
   */
  constructor({
    rules,
    debug,
    store,
  }: {
    rules: LimitRule<C>[];
    store: Store;
    debug?: boolean;
  }) {
    if (rules.length === 0) throw new EmptyRulesException();
    this.rules = rules ?? this.rules;
    this.debug = debug ?? this.debug;
    this.store = store;
  }

  /**
   * Check if a request should be allowed under the configured rate limits.
   *
   * Evaluates each rule in order. Returns as soon as a rule is exceeded (request denied).
   * If all rules allow the request, returns the result of the last rule evaluated.
   *
   * Each rule resolution (key, cost, policy) can be static or dynamic:
   * - Static: evaluated once and reused
   * - Dynamic: evaluated per request based on context
   * - Async: evaluated asynchronously (e.g., database lookups)
   *
   * @param ctx - Request context passed to rule resolvers to determine dynamic values.
   * @returns Promise resolving to the rate limit result. If debug mode is enabled,
   *          includes details about each evaluated rule and which rule failed (if any).
   *
   * @example
   * ```typescript
   * const result = await limiter.consume({
   *   userId: 'user-123',
   *   ip: '192.168.1.1',
   *   endpoint: '/api/search'
   * });
   *
   * if (!result.allowed) {
   *   console.log(`Rate limited. Retry in ${result.retryAfter} seconds`);
   * }
   * ```
   */
  async consume(ctx: C): Promise<RateLimitResult> {
    let result;
    const debugRules = [];
    for (const rule of this.rules) {
      const config =
        typeof rule.policy === "function"
          ? await rule.policy(ctx)
          : rule.policy;
      const key =
        typeof rule.key === "function" ? await rule.key(ctx) : rule.key;

      const cost =
        typeof rule.cost === "function" ? await rule.cost(ctx) : rule.cost;

      result = await this.store.consume(key, config, cost ?? 1);
      if (this.debug) {
        debugRules.push({ ...result, name: rule.name });
        if (result.allowed) console.log(debugRules);
        else console.error(debugRules);
      }
      if (result.remaining === 0) {
        if (this.debug) {
          const debugResults = {
            failedRule: rule.name,
            ...result,
            details: debugRules,
          };
          return debugResults;
        }
        return result;
      }
    }
    if (this.debug) {
      const final = {
        ...result,
        details: this.debug ? debugRules : undefined,
      };
      console.log(final);
      return final as DebugLimitResult;
    }

    return result!;
  }
}
