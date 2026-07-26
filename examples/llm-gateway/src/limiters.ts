import { RateLimiter } from '@limitkit/core';
import {
  InMemoryStore,
  fixedWindow,
  gcra,
  tokenBucket,
} from '@limitkit/memory';
import { modelWeightedCost, monthlyTokenBudget } from '@limitkit/ai';
import { MODEL_WEIGHTS, PLANS, User } from './plans';

/**
 * Swap for `@limitkit/redis` or `@limitkit/postgres` in production — the rules
 * below don't change, only the store and the algorithm import do.
 */
const store = new InMemoryStore();

/** What the rules need to know about a request. */
export interface GatewayContext {
  ip: string;
  user: User;
  model: string;
  /** Tokens to charge the budget for. */
  tokens: number;
}

const monthlyBudget = (ctx: GatewayContext) =>
  tokenBucket(
    monthlyTokenBudget({ tokens: PLANS[ctx.user.plan].monthlyTokens }),
  );

/**
 * Tokens weighted by model tier, so a frontier model drains the budget faster
 * than a small one.
 */
const weightedCost = modelWeightedCost<GatewayContext>({
  weights: MODEL_WEIGHTS,
  // Fail closed: a model we haven't priced is charged at the top rate.
  defaultWeight: 10,
  model: (ctx) => ctx.model,
  tokens: (ctx) => ctx.tokens,
});

function budgetCost(ctx: GatewayContext): number {
  const capacity = PLANS[ctx.user.plan].monthlyTokens;
  // A token bucket throws if a single cost exceeds its capacity. Clamping means
  // one enormous call drains the budget instead of erroring the request.
  return Math.min(weightedCost(ctx), capacity);
}

/**
 * Runs *before* the upstream call: a global per-IP limit, then a per-plan
 * burst limit. Neither depends on token counts, so both can run ahead of the
 * (possibly expensive) provider call.
 */
export const admissionLimiter = new RateLimiter<GatewayContext>({
  store,
  rules: [
    {
      name: 'global-ip',
      key: (ctx) => 'ip:' + ctx.ip,
      policy: fixedWindow({ window: 60, limit: 100 }),
    },
    {
      name: 'plan-burst',
      key: (ctx) => 'acc:' + ctx.user.id,
      policy: (ctx) =>
        gcra({ burst: PLANS[ctx.user.plan].requestsPerMinute, interval: 60 }),
    },
  ],
});

/**
 * Runs *after* the upstream call, charging the token budget for what the call
 * actually used. Token counts don't exist until the model has answered, so
 * this can only refuse the *next* request once a user is over budget — not
 * the one that put them there. See issue #27 for a reserve/commit API that
 * would close that gap.
 */
export const meteringLimiter = new RateLimiter<GatewayContext>({
  store,
  rules: [
    {
      name: 'monthly-tokens',
      key: (ctx) => 'acc:' + ctx.user.id,
      cost: budgetCost,
      policy: monthlyBudget,
    },
  ],
});
