import { AlgorithmConfig } from './algorithm-config';
import { RateLimitResult, RateLimitRuleResult } from './rate-limit-result';

/**
 * Names of the lifecycle events emitted by {@link RateLimiter.consume}.
 *
 * A single `consume()` call emits one `consume.start`, then for each rule it
 * evaluates a `rule.start` followed by exactly one of `rule.allow` / `rule.reject`
 * / `rule.error`, and finally one of `consume.allow` / `consume.reject` /
 * `consume.error`.
 */
export type LimitEventName =
  | 'consume.start'
  | 'consume.allow'
  | 'consume.reject'
  | 'consume.error'
  | 'rule.start'
  | 'rule.allow'
  | 'rule.reject'
  | 'rule.error';

/**
 * Context shared by every `rule.*` event within a single `consume()` call.
 */
export interface RuleEvent {
  /**
   * Request id. The same value is present on every event emitted by one
   * `consume()` call and is also returned on {@link RateLimitResult.id}, so
   * telemetry can be correlated with the caller's own logs and traces.
   */
  id: string;

  /**
   * The {@link LimitRule.name} of the rule being evaluated.
   */
  ruleName: string;

  /**
   * `Date.now()` captured when `rule.start` fired for this rule.
   */
  timestamp: number;

  /**
   * The resolved raw key (the value returned by the rule's `key` resolver, before
   * namespacing). `undefined` when `rule.error` fired before key resolution
   * completed.
   *
   * @remarks This value is frequently personally identifying — a user id, IP
   * address, or API key. Collectors that forward it to an external system
   * (as a span attribute, metric label, or log field) are responsible for
   * hashing or omitting it.
   */
  key?: string;

  /**
   * The resolved cost of the request (defaulted to `1`). `undefined` when
   * `rule.error` fired before cost resolution completed.
   */
  cost?: number;

  /**
   * The resolved algorithm configuration (`algorithm.config`) — a plain,
   * serialisable object, not the `Algorithm` instance. `undefined` when
   * `rule.error` fired before policy resolution completed.
   */
  policy?: AlgorithmConfig;
}

/**
 * Context for the `consume.*` root events.
 */
export interface ConsumeEvent {
  /**
   * Request id — see {@link RuleEvent.id}.
   */
  id: string;

  /**
   * `Date.now()` captured when `consume.start` fired.
   */
  timestamp: number;

  /**
   * Number of rules configured on the limiter.
   */
  ruleCount: number;
}

/**
 * Describes a rule that failed to evaluate — either a `key` / `cost` / `policy`
 * resolver threw, or the store's `consume` call rejected (e.g. the backing
 * database is unreachable).
 *
 * This is a value object carried on the `rule.error` / `consume.error` payloads.
 * It is not itself thrown; the original error still propagates out of
 * `consume()` unchanged.
 */
export interface RuleFailure {
  /**
   * The {@link LimitRule.name} of the rule that failed.
   */
  ruleName: string;

  /**
   * The original error thrown during resolution or by the store.
   */
  error: Error;
}

/**
 * Maps each {@link LimitEventName} to the payload passed to the matching
 * {@link RateLimitObserver} handler.
 */
export interface LimitEventMap {
  'consume.start': { event: ConsumeEvent };
  'consume.allow': {
    event: ConsumeEvent;
    result: RateLimitResult;
    durationMs: number;
  };
  'consume.reject': {
    event: ConsumeEvent;
    result: RateLimitResult;
    durationMs: number;
  };
  'consume.error': {
    event: ConsumeEvent;
    failure: RuleFailure;
    durationMs: number;
  };
  'rule.start': { event: RuleEvent };
  'rule.allow': {
    event: RuleEvent;
    result: RateLimitRuleResult;
    durationMs: number;
  };
  'rule.reject': {
    event: RuleEvent;
    result: RateLimitRuleResult;
    durationMs: number;
  };
  'rule.error': {
    event: RuleEvent;
    failure: RuleFailure;
    durationMs: number;
  };
}
