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
  RuleGroup,
  RuleOrGroup,
  Store,
  isRuleGroup,
} from './types';
import { addConfigToKey } from './utils';

/**
 * Maps each lifecycle event to the {@link RateLimitObserver} method that receives it.
 */
type NodeOutcome =
  | { status: 'skipped' }
  | { status: 'allowed' }
  | { status: 'rejected'; failedRule: string };

interface EvaluationRun<C> {
  ctx: C;
  id: string;
  consumeEvent: ConsumeEvent;
  consumeStart: number;
  evaluatedRules: IdentifiedRateLimitRuleResult[];
  /** `false` for {@link RateLimiter.peek}: read state, write nothing, emit nothing. */
  shouldConsume: boolean;
}

const ROOT_EVENTS = {
  consume: {
    start: 'consume.start',
    allow: 'consume.allow',
    reject: 'consume.reject',
    error: 'consume.error',
  },
  peek: {
    start: 'peek.start',
    allow: 'peek.allow',
    reject: 'peek.reject',
    error: 'peek.error',
  },
} as const;

const noopEmit = (): void => undefined;

const OBSERVER_METHOD: Record<LimitEventName, keyof RateLimitObserver> = {
  'consume.start': 'onConsumeStart',
  'consume.allow': 'onConsumeAllow',
  'consume.reject': 'onConsumeReject',
  'consume.error': 'onConsumeError',
  'peek.start': 'onPeekStart',
  'peek.allow': 'onPeekAllow',
  'peek.reject': 'onPeekReject',
  'peek.error': 'onPeekError',
  'rule.start': 'onRuleStart',
  'rule.allow': 'onRuleAllow',
  'rule.skip': 'onRuleSkip',
  'rule.reject': 'onRuleReject',
  'rule.error': 'onRuleError',
};

/**
 * Core rate limiter implementation that enforces rate limiting rules.
 *
 * The RateLimiter evaluates rules in order and stops if a rule fails.
 * The request is allowed if every rule passes. Entries may also be
 * {@link RuleGroup}s (`all` / `any`) that nest; the top level is an implicit `all`.
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
  private rules: RuleOrGroup<C>[] = [];
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
   * Create a new limiter with `newRules` appended to this limiter's rules
   * (i.e. to the top-level `all` group). This limiter is not modified.
   *
   * The new limiter shares the same `store` and observer objects. Observers
   * subscribed to this limiter later via {@link RateLimiter.subscribe} are not
   * carried over; subscribe on the extended limiter separately.
   *
   * `C2` may narrow the context (`C2 extends C`): extending a base limiter with
   * rules that need a richer context yields a limiter whose `consume` requires
   * that richer context.
   *
   * @param newRules - rules or groups to append after the existing rules
   * @returns a new {@link RateLimiter}
   *
   * @example
   * ```typescript
   * const authedLimiter = publicLimiter.extend(authenticatedRules);
   * ```
   */
  extend<C2 extends C = C>(newRules: RuleOrGroup<C2>[]): RateLimiter<C2> {
    return new RateLimiter<C2>({
      rules: [...this.rules, ...newRules],
      store: this.store,
      observers: this.observers,
    });
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
   * A {@link RuleGroup} with `mode: 'any'` allows if any child allows, but
   * evaluates (and charges) every child; it rejects only when all evaluated
   * children reject, reporting the group's `name` (else the first rejected
   * child) as `failedRule`. `all` groups behave like the top level.
   *
   * A rule whose {@link LimitRule.when} predicate resolves falsy is skipped
   * before any other resolver runs: no key, policy, or cost is resolved, the
   * store is not touched, the rule emits `rule.skip` instead of
   * `rule.allow` / `rule.reject`, and it does **not** appear in
   * {@link RateLimitResult.rules}. A request that skips every rule is allowed.
   *
   * Each rule resolution (`when`, key, cost, policy) can be static or dynamic:
   * - Static: evaluated once and reused
   * - Dynamic: evaluated per request based on context
   * - Async: evaluated asynchronously (e.g., database lookups)
   *
   * A resolved `cost` of `0` makes the rule an inert probe — it is evaluated
   * and reported in `result.rules`, but never rejects and never advances
   * stored state. A negative cost throws {@link BadArgumentsException}.
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
   * - `rules` ({@link IdentifiedRateLimitRuleResult}): one entry per rule that
   *   was evaluated, in order; skipped rules are omitted
   *
   * @throws UndefinedKeyException if a rule's resolved key is empty or undefined
   * @throws BadArgumentsException if a rule's resolved cost is negative
   * @throws Any error thrown by a rule's `when` / `key` / `cost` / `policy`
   *   resolver or by the store — it propagates unchanged after `rule.error`
   *   and `consume.error` are emitted. Keep resolvers total; use `when` to
   *   guard a rule rather than letting a resolver throw.
   *
   * @see RateLimitResult
   */
  async consume(ctx: C): Promise<RateLimitResult> {
    return this.run(ctx, true);
  }

  /**
   * Report what {@link RateLimiter.consume} would return for `ctx` right now,
   * without consuming anything.
   *
   * Keys, policies and costs resolve exactly as in `consume`, but the store is
   * read only: no state is written, no TTL is refreshed and no sliding-window
   * entry is added. Unlike `consume`, every rule is evaluated (no short-circuit
   * on the first rejection) so `rules` is complete, e.g. for
   * `X-RateLimit-*` headers; `failedRule` is the first rule that would reject.
   * `allowed` is `true` when a `consume(ctx)` would succeed.
   *
   * Observers receive `peek.start` / `peek.allow` / `peek.reject` /
   * `peek.error` (not `consume.*` or `rule.*`), so consume metrics are not skewed.
   *
   * @param ctx - Request context passed to rule resolvers.
   * @throws Error if the store does not declare `supportsPeek`
   * @throws UndefinedKeyException if a rule's resolved key is empty or undefined
   * @throws BadArgumentsException if a rule's resolved cost is negative
   */
  async peek(ctx: C): Promise<RateLimitResult> {
    if (typeof this.store.peek !== 'function')
      throw new Error('peek() is not supported by this store');
    return this.run(ctx, false);
  }

  private peekStore(
    key: string,
    algorithm: Algorithm<AlgorithmConfig>,
    now: number,
    cost: number,
  ): Promise<RateLimitRuleResult> {
    return (this.store.peek as NonNullable<Store['peek']>).call(
      this.store,
      key,
      algorithm,
      now,
      cost,
    );
  }

  private async run(ctx: C, shouldConsume: boolean): Promise<RateLimitResult> {
    const emit = this.emit.bind(this);
    const names = ROOT_EVENTS[shouldConsume ? 'consume' : 'peek'];
    const id = randomUUID();
    const consumeStart = Date.now();
    const consumeEvent: ConsumeEvent = {
      id,
      timestamp: consumeStart,
      ruleCount: this.rules.length,
    };
    emit(names.start, { event: consumeEvent });

    const evaluatedRules: IdentifiedRateLimitRuleResult[] = [];
    const outcome = await this.evaluateGroup(
      { mode: 'all', rules: this.rules },
      { ctx, id, consumeEvent, consumeStart, evaluatedRules, shouldConsume },
    );

    if (outcome.status === 'rejected') {
      const rejected: RateLimitResult = {
        id,
        allowed: false,
        failedRule: outcome.failedRule,
        rules: evaluatedRules,
      };
      emit(names.reject, {
        event: consumeEvent,
        result: rejected,
        durationMs: Date.now() - consumeStart,
      });
      return rejected;
    }

    const allowed: RateLimitResult = {
      id,
      allowed: true,
      failedRule: null,
      rules: evaluatedRules,
    };
    emit(names.allow, {
      event: consumeEvent,
      result: allowed,
      durationMs: Date.now() - consumeStart,
    });
    return allowed;
  }

  /**
   * Evaluate one entry (rule or group) and report its outcome.
   */
  private evaluateNode(
    node: RuleOrGroup<C>,
    run: EvaluationRun<C>,
  ): Promise<NodeOutcome> {
    return isRuleGroup(node)
      ? this.evaluateGroup(node, run)
      : this.evaluateLeaf(node, run);
  }

  /**
   * Evaluate a group under its combinator. A group whose `when` is falsy, or
   * whose children were all skipped, is `skipped` (neutral to its parent).
   */
  private async evaluateGroup(
    group: RuleGroup<C>,
    run: EvaluationRun<C>,
  ): Promise<NodeOutcome> {
    const when =
      typeof group.when === 'function'
        ? await group.when(run.ctx)
        : (group.when ?? true);
    if (!when) return { status: 'skipped' };

    let evaluated = 0;
    let anyAllowed = false;
    let firstRejected: string | undefined;
    for (const child of group.rules) {
      const outcome = await this.evaluateNode(child, run);
      if (outcome.status === 'skipped') continue;
      evaluated++;
      if (outcome.status === 'allowed') {
        anyAllowed = true;
      } else {
        // `consume` stops at the first rejection; `peek` keeps going so the
        // report covers every rule.
        if (group.mode === 'all' && run.shouldConsume) return outcome;
        firstRejected ??= outcome.failedRule;
      }
    }
    if (evaluated === 0) return { status: 'skipped' };
    if (group.mode === 'all' && firstRejected !== undefined)
      return { status: 'rejected', failedRule: firstRejected };
    if (group.mode === 'any' && !anyAllowed)
      return {
        status: 'rejected',
        failedRule: group.name ?? (firstRejected as string),
      };
    return { status: 'allowed' };
  }

  /**
   * Evaluate a single rule against the store, emitting its lifecycle events.
   */
  private async evaluateLeaf(
    rule: LimitRule<C>,
    {
      ctx,
      id,
      consumeEvent,
      consumeStart,
      evaluatedRules,
      shouldConsume,
    }: EvaluationRun<C>,
  ): Promise<NodeOutcome> {
    const emit = shouldConsume ? this.emit.bind(this) : noopEmit;
    const ruleStart = Date.now();
    emit('rule.start', {
      event: { id, ruleName: rule.name, timestamp: ruleStart },
    });

    let key: string | undefined;
    let cost: number | undefined;
    let policy: AlgorithmConfig | undefined;
    let result: RateLimitRuleResult;

    try {
      const when =
        typeof rule.when === 'function'
          ? await rule.when(ctx)
          : (rule.when ?? true);
      if (!when) {
        emit('rule.skip', {
          event: { id, ruleName: rule.name, timestamp: ruleStart },
          durationMs: Date.now() - ruleStart,
        });
        return { status: 'skipped' };
      }

      const algorithm: Algorithm<AlgorithmConfig> =
        typeof rule.policy === 'function'
          ? await rule.policy(ctx)
          : rule.policy;
      policy = algorithm.config;

      key = typeof rule.key === 'function' ? await rule.key(ctx) : rule.key;
      if (!key) throw new UndefinedKeyException(rule.name);

      const resolvedCost =
        typeof rule.cost === 'function' ? await rule.cost(ctx) : rule.cost;
      if (resolvedCost !== undefined && resolvedCost < 0)
        throw new BadArgumentsException(
          `Cost must be a non-negative integer, got cost=${resolvedCost}`,
        );
      cost = resolvedCost ?? 1;

      const keyWithConfig = addConfigToKey(
        algorithm.config,
        key,
        rule.bucket ?? rule.name,
      );
      result = shouldConsume
        ? await this.store.consume(keyWithConfig, algorithm, Date.now(), cost)
        : await this.peekStore(keyWithConfig, algorithm, Date.now(), cost);

      // A zero-cost rule is an inert probe. Every algorithm adds `cost` to
      // its counter, so a cost of 0 already leaves stored state untouched —
      // but a few (e.g. sliding-window-counter) still *report*
      // `allowed: false` once the bucket is full. Force the rule to pass so
      // it can never reject on its own account, while its limit / remaining /
      // resetAt still surface in `result.rules` for headers and telemetry.
      if (cost === 0)
        result = { ...result, allowed: true, availableAt: undefined };
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
      emit('rule.error', {
        event: ruleEvent,
        failure,
        durationMs: failedAt - ruleStart,
      });
      this.emit(ROOT_EVENTS[shouldConsume ? 'consume' : 'peek'].error, {
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
      emit('rule.allow', {
        event: ruleEvent,
        result,
        durationMs: ruleDurationMs,
      });
      return { status: 'allowed' };
    }
    emit('rule.reject', {
      event: ruleEvent,
      result,
      durationMs: ruleDurationMs,
    });
    return { status: 'rejected', failedRule: rule.name };
  }
}
