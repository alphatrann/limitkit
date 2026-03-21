import {
  BadArgumentsException,
  EmptyRulesException,
  UndefinedKeyException,
} from "./exceptions";
import {
  Algorithm,
  AlgorithmConfig,
  RateLimitResult,
  Limiter,
  LimitRule,
  RateLimitConfig,
  Store,
  IdentifiedRateLimitRuleResult,
} from "./types";
import { addConfigToKey } from "./utils";

/**
 * Core rate limiter implementation that enforces rate limiting rules.
 *
 * The RateLimiter evaluates rules in order and stops if a rule fails.
 * The request is allowed if every rule passes.
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
 *       policy: fixedWindow({ window: 60, limit: 100 })
 *     }
 *   ]
 * });
 *
 * const result = await limiter.consume({ userId: 'user-123' });
 * if (!result.allowed) {
 *   return 429
 * }
 * ```
 * @see Limiter
 * @see LimitRule
 * @see Store
 */
export class RateLimiter<C = unknown> implements Limiter<C> {
  private rules: LimitRule<C>[] = [];
  private store: Store;

  /**
   * Create a new rate limiter instance.
   * @throws {EmptyRulesException} If the list of rules is empty
   * @param config - Configuration for the rate limiter
   * @see RateLimitConfig
   */
  constructor({ rules, store }: RateLimitConfig<C>) {
    if (rules.length === 0) throw new EmptyRulesException();
    this.rules = rules ?? this.rules;
    this.store = store;
  }

  /**
   * Return the configuration object
   * @returns {RateLimitConfig<C>}
   */
  get config(): RateLimitConfig<C> {
    return { rules: this.rules, store: this.store };
  }

  /**
   * Check if a request should be allowed under the configured rate limits.
   *
   * Evaluates each rule in order from left to right.
   * If a rule fails, remaining rules won't be evaluated and the request is rejected.
   *
   *
   * Each rule resolution (key, cost, policy) can be static or dynamic:
   * - Static: evaluated once and reused
   * - Dynamic: evaluated per request based on context
   * - Async: evaluated asynchronously (e.g., database lookups)
   *
   *
   * @param ctx - Request context passed to rule resolvers to determine dynamic values.
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
   *   console.log(`Rate limited. Retry at ${new Date(result.retryAt)}`);
   * }
   * ```
   *
   * @returns {RateLimitResult} an object containing:
   * - `allowed` (boolean): whether the request is allowed
   * - `failedRule` (string): the name of the failed rule, `null` if every rule passes
   * - `rules` ({@link IdentifiedRateLimitRuleResult}): details of all the rules evaluated
   *
   * @throws UndefinedKeyException if the key is empty or undefined
   *
   * @see RateLimitResult
   */
  async consume(ctx: C): Promise<RateLimitResult> {
    const evaluatedRules: IdentifiedRateLimitRuleResult[] = [];
    for (const rule of this.rules) {
      const algorithm: Algorithm<AlgorithmConfig> =
        typeof rule.policy === "function"
          ? await rule.policy(ctx)
          : rule.policy;
      const key =
        typeof rule.key === "function" ? await rule.key(ctx) : rule.key;

      if (!key) throw new UndefinedKeyException(rule.name);

      const cost =
        typeof rule.cost === "function" ? await rule.cost(ctx) : rule.cost;

      if (cost !== undefined && cost <= 0)
        throw new BadArgumentsException(
          `Cost must be a positive integer, got cost=${cost}`,
        );

      const keyWithConfig = addConfigToKey(algorithm.config, key);

      const result = await this.store.consume(
        keyWithConfig,
        algorithm,
        Date.now(),
        cost ?? 1,
      );

      evaluatedRules.push({ ...result, name: rule.name });
      if (!result.allowed) {
        return {
          allowed: result.allowed,
          failedRule: rule.name,
          rules: evaluatedRules,
        };
      }
    }

    return {
      allowed: true,
      failedRule: null,
      rules: evaluatedRules,
    };
  }
}
