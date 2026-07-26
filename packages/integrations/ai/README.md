# @limitkit/ai

**Rate limit LLM traffic by the tokens it burns, not the requests it makes.**

A request is a terrible unit for an LLM API. One call can cost a hundred tokens or a hundred thousand, and a frontier model's tokens can cost twenty times a small model's. `@limitkit/ai` gives you the two pieces needed to budget by what a call actually costs:

- **Usage extractors** — pull token counts out of a provider's response into one normalized shape.
- **Token budgets** — turn "1M tokens a month" into the token-bucket policy that expresses it.

No provider SDK is required. Responses are read structurally, so objects from `openai`, `@anthropic-ai/sdk`, `ollama`, or a raw `fetch` all work. The only dependency is `@limitkit/core`.

---

## Installation

```bash
npm install @limitkit/core @limitkit/ai @limitkit/memory
```

The algorithm comes from your store package (`@limitkit/memory`, `@limitkit/redis`, or `@limitkit/postgres`), as everywhere else in LimitKit.

---

## Quick Example

```ts
import { RateLimiter } from '@limitkit/core';
import { InMemoryStore, tokenBucket } from '@limitkit/memory';
import { extractOpenAIUsage, monthlyTokenBudget } from '@limitkit/ai';

const limiter = new RateLimiter<{ userId: string; tokens: number }>({
  store: new InMemoryStore(),
  rules: [
    {
      name: 'monthly-tokens',
      key: (ctx) => 'acc:' + ctx.userId,
      cost: (ctx) => ctx.tokens,
      policy: tokenBucket(monthlyTokenBudget({ tokens: 1_000_000 })),
    },
  ],
});

const completion = await openai.chat.completions.create({ ... });
const usage = extractOpenAIUsage(completion);

const result = await limiter.consume({ userId, tokens: usage.totalTokens });
if (!result.allowed) {
  // Budget exhausted.
}
```

---

## Token budgets

A budget preset takes a number of tokens and a period, and returns the `{ capacity, refillRate }` a token bucket needs. Pass the result to any store's `tokenBucket()`:

```ts
import { tokenBucket } from '@limitkit/redis'; // or /memory, /postgres
import { monthlyTokenBudget } from '@limitkit/ai';

policy: tokenBucket(monthlyTokenBudget({ tokens: 1_000_000 }));
```

| Preset                                     | Period                         |
| ------------------------------------------ | ------------------------------ |
| `monthlyTokenBudget({ tokens })`           | 30 days                        |
| `weeklyTokenBudget({ tokens })`            | 7 days                         |
| `sessionTokenBudget({ tokens, duration })` | `duration` seconds, default 1h |
| `tokenBudget({ tokens, period })`          | `period` seconds — any other   |

They exist because `refillRate` is **tokens per second**, and converting a budget to it by hand is easy to get wrong: 1M tokens a month is `0.386` tokens/second, not `33_333`. Getting that wrong by five orders of magnitude produces a limiter that looks configured but never limits anything.

Every preset also takes an optional `burst`, capping how many tokens can be spent at once:

```ts
// 1M tokens a month, but no more than 50k in one go.
monthlyTokenBudget({ tokens: 1_000_000, burst: 50_000 });
```

By default `capacity` equals the full budget, so a user may spend the month's allowance immediately and then earn it back continuously.

---

## Usage extractors

Every extractor returns the same `TokenUsage`:

```ts
interface TokenUsage {
  inputTokens: number; // prompt tokens, including any cached
  outputTokens: number; // completion tokens, including reasoning
  totalTokens: number; // input + output — the usual thing to charge
  cachedInputTokens: number; // the portion of inputTokens served from cache
}
```

| Extractor                 | Reads                                                          |
| ------------------------- | -------------------------------------------------------------- |
| `extractOpenAIUsage`      | Chat Completions **and** Responses API (either counter naming) |
| `extractAnthropicUsage`   | Messages API, including cache read/write counters              |
| `extractOllamaUsage`      | `prompt_eval_count` / `eval_count`                             |
| `extractHuggingFaceUsage` | Inference Providers' OpenAI-compatible chat-completion route   |

They never throw. A response with no `usage` — a stream chunk, an error body — reports zeroes.

### Why normalize at all

The providers do not agree on what "input tokens" means. **OpenAI counts cached prompt tokens inside `prompt_tokens`. Anthropic does not** — its `input_tokens` is the uncached remainder, and the real prompt size is `input_tokens + cache_read_input_tokens + cache_creation_input_tokens`. Charging `usage.input_tokens` directly from both providers silently undercounts every cached Anthropic call. The extractors reconcile this, so `inputTokens` means the same thing everywhere.

`cachedInputTokens` is reported separately because cached input is billed at a fraction of the normal rate. If your budget models cost rather than raw throughput, discount it:

```ts
cost: (ctx) => {
  const { inputTokens, outputTokens, cachedInputTokens } = ctx.usage;
  return inputTokens - cachedInputTokens * 0.9 + outputTokens;
};
```

---

## Model-tiered cost weighting

Raw token counts treat every model's tokens as equal. They aren't. `modelWeightedCost` builds a `cost` resolver that scales tokens by the model that served them, so one budget can govern a whole model lineup — a user can burn their quota on many cheap calls or a few expensive ones.

```ts
import { modelWeightedCost, monthlyTokenBudget } from '@limitkit/ai';
import { tokenBucket } from '@limitkit/redis';

{
  name: 'monthly-tokens',
  key: (ctx) => 'acc:' + ctx.userId,
  cost: modelWeightedCost<ChatContext>({
    weights: { 'gpt-4o': 10, 'gpt-4o-mini': 1 },
    defaultWeight: 10, // fail closed on a model you haven't priced
    model: (ctx) => ctx.model,
    tokens: (ctx) => ctx.usage.totalTokens,
  }),
  policy: tokenBucket(monthlyTokenBudget({ tokens: 1_000_000 })),
}
```

Weights are relative, so only their ratios matter — the natural basis is price. This package deliberately ships **no built-in price table**: provider pricing changes and model names churn, and a stale table baked into a rate limiter is worse than no table.

---

## Charging before or after the call

Token counts don't exist until the model has answered, which puts the budget in an awkward spot: the natural place to charge is _after_ the call, but by then refusing is pointless — the tokens are already spent.

**Charging after the call cannot enforce a budget.** It can only report that one is now exhausted, so the _next_ call is refused. If a single overrunning call is acceptable, this is the simplest thing that works:

```ts
const usage = extractOpenAIUsage(completion);
const result = await limiter.consume({ userId, tokens: usage.totalTokens });
// result.allowed === false means the budget is now spent.
```

**To actually refuse an over-budget call, reserve first.** Estimate from the prompt (which you have) before calling, then charge only the overage afterwards:

```ts
const estimated = Math.ceil(prompt.length / 4) + MAX_OUTPUT_TOKENS;

const admission = await limiter.consume({ userId, tokens: estimated });
if (!admission.allowed)
  return res.status(429).json({ error: 'Budget exhausted' });

const usage = extractOpenAIUsage(await callModel(prompt));

const overage = Math.max(0, usage.totalTokens - estimated);
if (overage > 0) await limiter.consume({ userId, tokens: overage });
```

Cap `max_tokens` upstream so the estimate is a real bound rather than a guess. The catch: when a call comes in _under_ the estimate, LimitKit has no way to hand the difference back, so the user is charged the reservation. A reserve/commit API that can release an unused reservation is [proposed on the roadmap](../../../ROADMAP.md).

[`examples/llm-gateway`](../../../examples/llm-gateway) implements this pattern end to end.

---

## License

MIT
