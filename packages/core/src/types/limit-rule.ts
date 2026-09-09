import { Algorithm } from './algorithm';
import { AlgorithmConfig } from './algorithm-config';

/**
 * Defines a single rate limiting rule with its associated algorithm and constraints.
 *
 * Rules are evaluated in order, and the rate limiter returns the result of the first
 * rule that reaches its limit. This allows for layered rate limiting (e.g., per-user
 * and per-IP limits simultaneously).
 *
 * @template C The context type used to dynamically determine rule parameters.
 */
export interface LimitRule<C = unknown> {
  /**
   * Unique name/identifier for this rule. Appears as {@link RateLimitResult.failedRule}
   * when this rule is the one that rejects a request, and as the `rule` attribute
   * on every lifecycle event the rule emits.
   *
   * Unless {@link LimitRule.bucket} is set, `name` is also the rule's storage
   * scope: two rules share quota state only when they resolve to the same scope,
   * so a unique `name` keeps a rule's counter isolated even from another rule
   * with an identical algorithm, config, and resolved key.
   */
  name: string;

  /**
   * Storage scope for this rule's quota. Defaults to {@link LimitRule.name},
   * which keeps every rule's counter independent.
   *
   * Set the **same** `bucket` on two or more rules that must draw down one
   * shared allowance (e.g. a read rule and a write rule that together must not
   * exceed a per-tenant budget). They still only share a counter when their
   * resolved key, algorithm, and algorithm config also match — the scope is one
   * segment of the store key, not the whole of it — so a shared bucket cannot
   * make a token-bucket rule and a fixed-window rule collide.
   *
   * Changing `bucket` (like changing the algorithm or its config) points the
   * rule at a fresh counter; the old state is left to expire.
   */
  bucket?: string;

  /**
   * The rate limiting key that groups requests together.
   *
   * Can be:
   * - A **fixed string**: All requests use the same limit (e.g., "global-api-limit")
   * - A **function**: Dynamically determines the key per request (e.g., extract user ID from context)
   * - An **async function**: For async key resolution (e.g., lookup user tier from database)
   *
   * Example: `(ctx) => ctx.userId` to apply per-user rate limits
   */
  key: string | ((ctx: C) => string | Promise<string>);

  /**
   * Weight of each request against this rule's limit. Defaults to `1`.
   *
   * Can be:
   * - A **fixed number**: every request costs the same
   * - A **function** (optionally async): different requests cost different amounts
   *   (e.g. an expensive endpoint, or an LLM call weighted by token count)
   *
   * A cost of `0` is an **inert probe**: the rule is still evaluated and its
   * standing is still reported in {@link RateLimitResult.rules}, but it never
   * rejects and never advances stored state. Use it to surface a rule's
   * headers/metrics on requests that shouldn't be charged. This differs from
   * {@link LimitRule.when} being falsy, which skips the rule entirely — no
   * evaluation, no entry in `result.rules`, no `store` call.
   *
   * A **negative** cost throws `BadArgumentsException`.
   */
  cost?: number | ((ctx: C) => number | Promise<number>);

  /**
   * The rate limiting algorithm and its configuration.
   *
   * Can be:
   * - A **fixed policy**: Same algorithm for all requests (e.g., 100 requests per minute)
   * - A **function**: Dynamically choose algorithm per request (e.g., stricter limits for free tier users)
   * - An **async function**: For async policy resolution (e.g., fetch limits from a service)
   */
  policy: PolicyResolver<C>;

  /**
   * Gate that decides whether this rule applies to a request. Defaults to `true`
   * (the rule always applies).
   *
   * Can be:
   * - A **fixed boolean**
   * - A **function** (optionally async) of the context, e.g.
   *   `(ctx) => ctx.user !== undefined` to run a rule only for authenticated
   *   requests, or `(ctx) => ctx.path.startsWith('/admin')` to scope it to a
   *   route group.
   *
   * Resolved **before** `key`, `cost`, and `policy`. When it resolves falsy the
   * rule is skipped completely: none of those resolvers run, the store is not
   * touched, the rule emits `rule.skip` (not `rule.allow` / `rule.reject`), and
   * it does not appear in {@link RateLimitResult.rules}. It can never be
   * {@link RateLimitResult.failedRule}.
   *
   * The predicate should be total. If it throws, the error propagates out of
   * `consume()` exactly as a throwing `key` / `cost` / `policy` resolver would.
   */
  when?: boolean | ((ctx: C) => boolean | Promise<boolean>);
}

/**
 * Resolver function type for rate limit policies.
 */
type PolicyResolver<C> =
  | Algorithm<AlgorithmConfig>
  | ((
      ctx: C,
    ) => Algorithm<AlgorithmConfig> | Promise<Algorithm<AlgorithmConfig>>);
