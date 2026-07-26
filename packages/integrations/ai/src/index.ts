/**
 * LimitKit AI - LLM token budgeting
 *
 * Rate limit LLM traffic by the tokens it actually burns instead of by request
 * count. Two pieces:
 *
 * 1. **Usage extractors** normalize the `usage` object of an LLM response into
 *    a single {@link TokenUsage} shape, so one rule works across providers.
 * 2. **Token budget presets** turn "1M tokens a month" into the token-bucket
 *    config that expresses it, without you doing the per-second arithmetic.
 *
 * This package depends only on `@limitkit/core` — no provider SDKs. Responses
 * are read structurally, so an object from `openai`, `@anthropic-ai/sdk`,
 * `ollama`, or a raw `fetch` all work.
 *
 * ## Quick Start
 *
 * ```typescript
 * import { RateLimiter } from '@limitkit/core';
 * import { InMemoryStore, tokenBucket } from '@limitkit/memory';
 * import { extractOpenAIUsage, monthlyTokenBudget } from '@limitkit/ai';
 *
 * const limiter = new RateLimiter<{ userId: string; tokens: number }>({
 *   store: new InMemoryStore(),
 *   rules: [
 *     {
 *       name: 'monthly-tokens',
 *       key: (ctx) => 'acc:' + ctx.userId,
 *       cost: (ctx) => ctx.tokens,
 *       policy: tokenBucket(monthlyTokenBudget({ tokens: 1_000_000 })),
 *     },
 *   ],
 * });
 *
 * const completion = await openai.chat.completions.create({ ... });
 * const usage = extractOpenAIUsage(completion);
 *
 * const result = await limiter.consume({ userId, tokens: usage.totalTokens });
 * if (!result.allowed) {
 *   // Budget exhausted — refuse the next call.
 * }
 * ```
 *
 * The token budget is charged *after* the call, since token counts aren't known
 * until the model has answered. A request that overruns the remaining budget is
 * therefore served, and the budget stops the *next* one. See the package README
 * for the admission/metering pattern that closes most of that gap.
 *
 * @packageDocumentation
 */

export * from './types';
export * from './extractors';
export * from './budgets';
export * from './cost';
export * from './utils';
