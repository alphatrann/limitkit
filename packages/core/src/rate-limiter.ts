import { randomUUID } from 'crypto';
import {
  BadArgumentsException,
  EmptyRulesException,
  UndefinedKeyException,
} from './exceptions';
import {
  Algorithm,
  AlgorithmConfig,
  ConsumeEvent,
  IdentifiedRateLimitRuleResult,
  Limiter,
  LimitEventMap,
  LimitEventName,
  LimitRule,
  RateLimitConfig,
  RateLimitObserver,
  RateLimitResult,
  RateLimitRuleResult,
  RuleEvent,
  RuleFailure,
  Store,
} from './types';
import { addConfigToKey } from './utils';

/**
 * Maps each lifecycle event to the {@link RateLimitObserver} method that receives it.
 */
const OBSERVER_METHOD: Record<LimitEventName, keyof RateLimitObserver> = {
  'consume.start': 'onConsumeStart',
  'consume.allow': 'onConsumeAllow',
  'consume.reject': 'onConsumeReject',
  'consume.error': 'onConsumeError',
  'rule.start': 'onRuleStart',
  'rule.allow': 'onRuleAllow',
  'rule.reject': 'onRuleReject',
  'rule.error': 'onRuleError',
};

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
  private observers: RateLimitObserver[] = [];

  /**
   * Create a new rate limiter instance.
   * @throws {EmptyRulesException} If the list of rules is empty
   * @param config - Configuration for the rate limiter
   * @see RateLimitConfig
   */
  constructor({ rules, store, observers }: RateLimitConfig<C>) {
    if (rules.length === 0) throw new EmptyRulesException();
    this.rules = rules ?? this.rules;
    this.store = store;
    this.observers = observers ? [...observers] : [];
  }

  /**
   * Return the configuration object
   * @returns {RateLimitConfig<C>}
   */
  get config(): RateLimitConfig<C> {
    return {
      rules: this.rules,
      store: this.store,
      observers: this.observers,
    };
  }

  /**
   * Register a telemetry collector for `consume()` lifecycle events.
   *
   * @param observer - the collector to notify
   * @returns a function that removes the observer when called
   */
  subscribe(observer: RateLimitObserver): () => void {
    this.observers.push(observer);
    return () => {
      this.observers = this.observers.filter((o) => o !== observer);
    };
  }

  /**
   * Notify every registered observer of a lifecycle event.
   *
   * Dispatch is synchronous and fire-and-forget: a handler that throws is
   * isolated (its error is routed to `onObserverError`) and never aborts the
   * loop, the other observers, or `consume()`.
   */
  private emit<K extends LimitEventName>(
    name: K,
    payload: LimitEventMap[K],
  ): void {
    const method = OBSERVER_METHOD[name];
    for (const observer of this.observers) {
      const handler = observer[method] as
        ((p: LimitEventMap[K]) => void) | undefined;
      if (!handler) continue;
      try {
        handler.call(observer, payload);
      } catch (error) {
        try {
          observer.onObserverError?.(error, name);
        } catch {
          // An onObserverError that itself throws is swallowed — telemetry
          // must never break consume().
        }
      }
    }
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
   *   console.log(`Rate limited. Retry at ${new Date(result.availableAt)}`);
   * }
   * ```
   *
   * @returns {RateLimitResult} an object containing:
   * - `id` (string): request id, also present on every emitted lifecycle event
   * - `allowed` (boolean): whether the request is allowed
   * - `failedRule` (string): the name of the failed rule, `null` if every rule passes
   * - `rules` ({@link IdentifiedRateLimitRuleResult}): details of all the rules evaluated
   *
   * @throws UndefinedKeyException if the key is empty or undefined
   *
   * @see RateLimitResult
   */
  async consume(ctx: C): Promise<RateLimitResult> {
    const id = randomUUID();
    const consumeStart = Date.now();
    const consumeEvent: ConsumeEvent = {
      id,
      timestamp: consumeStart,
      ruleCount: this.rules.length,
    };
    this.emit('consume.start', { event: consumeEvent });

    const evaluatedRules: IdentifiedRateLimitRuleResult[] = [];

    for (const rule of this.rules) {
      const ruleStart = Date.now();
      this.emit('rule.start', {
        event: { id, ruleName: rule.name, timestamp: ruleStart },
      });

      let key: string | undefined;
      let cost: number | undefined;
      let policy: AlgorithmConfig | undefined;
      let result: RateLimitRuleResult;

      try {
        const algorithm: Algorithm<AlgorithmConfig> =
          typeof rule.policy === 'function'
            ? await rule.policy(ctx)
            : rule.policy;
        policy = algorithm.config;

        key = typeof rule.key === 'function' ? await rule.key(ctx) : rule.key;
        if (!key) throw new UndefinedKeyException(rule.name);

        const resolvedCost =
          typeof rule.cost === 'function' ? await rule.cost(ctx) : rule.cost;
        if (resolvedCost !== undefined && resolvedCost <= 0)
          throw new BadArgumentsException(
            `Cost must be a positive integer, got cost=${resolvedCost}`,
          );
        cost = resolvedCost ?? 1;

        const keyWithConfig = addConfigToKey(algorithm.config, key);
        result = await this.store.consume(
          keyWithConfig,
          algorithm,
          Date.now(),
          cost,
        );
      } catch (error) {
        const failure: RuleFailure = {
          ruleName: rule.name,
          error: error as Error,
        };
        const ruleEvent: RuleEvent = {
          id,
          ruleName: rule.name,
          timestamp: ruleStart,
          key,
          cost,
          policy,
        };
        const failedAt = Date.now();
        this.emit('rule.error', {
          event: ruleEvent,
          failure,
          durationMs: failedAt - ruleStart,
        });
        this.emit('consume.error', {
          event: consumeEvent,
          failure,
          durationMs: failedAt - consumeStart,
        });
        throw error;
      }

      evaluatedRules.push({ ...result, name: rule.name });

      const ruleEvent: RuleEvent = {
        id,
        ruleName: rule.name,
        timestamp: ruleStart,
        key,
        cost,
        policy,
      };
      const ruleDurationMs = Date.now() - ruleStart;
      if (result.allowed) {
        this.emit('rule.allow', {
          event: ruleEvent,
          result,
          durationMs: ruleDurationMs,
        });
      } else {
        this.emit('rule.reject', {
          event: ruleEvent,
          result,
          durationMs: ruleDurationMs,
        });

        const rejected: RateLimitResult = {
          id,
          allowed: false,
          failedRule: rule.name,
          rules: evaluatedRules,
        };
        this.emit('consume.reject', {
          event: consumeEvent,
          result: rejected,
          durationMs: Date.now() - consumeStart,
        });
        return rejected;
      }
    }

    const allowed: RateLimitResult = {
      id,
      allowed: true,
      failedRule: null,
      rules: evaluatedRules,
    };
    this.emit('consume.allow', {
      event: consumeEvent,
      result: allowed,
      durationMs: Date.now() - consumeStart,
    });
    return allowed;
  }
}
