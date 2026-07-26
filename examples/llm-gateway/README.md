# LLM gateway example

An Express gateway in front of an LLM API, rate limited with LimitKit. It shows three layers of rules in one rule set and a per-user monthly **token** budget built with [`@limitkit/ai`](../../packages/integrations/ai).

Runs with stubbed completions by default — no API key, no network.

## Run it

From the repo root:

```bash
yarn install
yarn build
yarn workspace @limitkit/example-llm-gateway start
```

`start`/`dev` load `examples/llm-gateway/.env` via `dotenv` — copy [`.env.example`](./.env.example) to `.env` and fill in whichever providers you want to hit for real. Set `PORT` there to move the server off 3000.

Two API keys are hardcoded: `key-free` (50k tokens/month, 5 req/min) and `key-pro` (2M tokens/month, 60 req/min).

```bash
curl -X POST localhost:3000/chat \
  -H 'content-type: application/json' \
  -H 'x-api-key: key-free' \
  -d '{"provider": "openai", "model": "gpt-4o-mini", "prompt": "hello"}'
```

## Providers

Requests take a `provider` field (`openai` | `anthropic` | `ollama` | `huggingface`, default `openai`) and dispatch to that provider's own module in [`src/providers/`](./src/providers/), each calling the provider's official SDK and normalizing usage with the matching `@limitkit/ai` extractor. Every provider falls back to a stub completion — with plausible token counts derived from prompt length — when it has no credentials (or, for Ollama, when the local daemon isn't reachable), so the whole gateway and its rate limits run with no keys and no network.

| Provider      | SDK                      | Credential          | Falls back to stub when...                                             |
| ------------- | ------------------------ | ------------------- | ---------------------------------------------------------------------- |
| `openai`      | `openai`                 | `OPENAI_API_KEY`    | unset                                                                  |
| `anthropic`   | `@anthropic-ai/sdk`      | `ANTHROPIC_API_KEY` | unset                                                                  |
| `ollama`      | `ollama`                 | none (local)        | daemon unreachable at `OLLAMA_HOST` (default `http://127.0.0.1:11434`) |
| `huggingface` | `@huggingface/inference` | `HF_TOKEN`          | unset                                                                  |

## The rules

All three live in [`src/limiters.ts`](./src/limiters.ts), split across two rule sets: `global-ip` and `plan-burst` run _before_ the upstream call as `admissionLimiter`, and `monthly-tokens` runs _after_ it as `meteringLimiter` (see [Charged after the call](#charged-after-the-call)). Either one rejecting names itself in `failedRule`.

| Rule             | Limits                              | Algorithm              |
| ---------------- | ----------------------------------- | ---------------------- |
| `global-ip`      | 100 requests/min per IP             | Fixed window           |
| `plan-burst`     | 5 (free) or 60 (pro) requests/min   | GCRA, per plan         |
| `monthly-tokens` | 50k (free) or 2M (pro) tokens/month | Token bucket, per plan |

`monthly-tokens` charges **tokens weighted by model**, keyed as `"provider/model"` in [`src/plans.ts`](./src/plans.ts) since model names aren't unique across providers: frontier models (`openai/gpt-5.6-sol`, `openai/gpt-5.6-luna`, `anthropic/claude-opus-5`) are priced well above `openai/gpt-4o-mini`, so the budget drains much faster on them. An unrecognized `provider/model` is charged at the top rate rather than slipping through cheaply.

## Charged after the call

Token counts don't exist until the model has answered, so `monthly-tokens` is charged in [`src/index.ts`](./src/index.ts) only once the upstream call returns, using the real usage the response reports — no estimate, no reservation.

The tradeoff: this can't refuse the call that overruns the budget, only the _next_ one. A burst of concurrent requests can all land before any of them see the drained budget. [Issue #27](https://github.com/alphatrann/limitkit/issues/27) proposes a reserve/commit API that would let a rule reserve an estimate up front and correct it afterward, closing that gap — this example doesn't use it since it isn't implemented yet.

The `global-ip` and `plan-burst` rules above don't have this problem: they're request-count limits, not token counts, so they still run _before_ the upstream call and can refuse it outright.

## Watching it limit

Drain the free plan's budget with a few expensive calls — every one still returns `200`, since `monthly-tokens` only runs after the call, but watch `budget.remaining` and `budget.charged`:

```bash
BIG=$(node -e "process.stdout.write('x'.repeat(1600))")
for i in 1 2 3; do
  curl -s -X POST localhost:3000/chat \
    -H 'content-type: application/json' -H 'x-api-key: key-free' \
    -d "{\"provider\":\"openai\",\"model\":\"gpt-5.6-sol\",\"prompt\":\"$BIG\"}" \
    | node -e "process.stdin.once('data', d => { const b = JSON.parse(d).budget; console.log('req $i ->', b) })"
done
# req 1 -> { plan: 'free', monthlyTokens: 50000, remaining: 26000, charged: true }
# req 2 -> { plan: 'free', monthlyTokens: 50000, remaining: 2000, charged: true }
# req 3 -> { plan: 'free', monthlyTokens: 50000, remaining: 2000, charged: false }
```

`req 3` costs more than the 2,000 tokens left, so the charge is rejected and `remaining` doesn't move — the call still went through and still cost real money upstream, it just isn't reflected in the budget. That's the gap [issue #27](https://github.com/alphatrann/limitkit/issues/27) exists to close.

Or trip the burst limit with cheap ones:

```bash
for i in $(seq 6); do
  curl -s -o /dev/null -w "req $i -> %{http_code}\n" -X POST localhost:3000/chat \
    -H 'content-type: application/json' -H 'x-api-key: key-free' \
    -d '{"provider":"ollama","model":"qwen2.5:7b-instruct","prompt":"hi"}'
done
# req 6 -> 429   (failedRule: plan-burst)
```

Successful responses carry `x-tokens-used` and `x-tokens-remaining`; rejections carry `retry-after`.

## Going to production

The example uses `InMemoryStore`, so budgets reset when the process does and aren't shared across instances. Swap the store and the algorithm import in `src/limiters.ts` — the rules themselves don't change:

```diff
- import { InMemoryStore, fixedWindow, gcra, tokenBucket } from '@limitkit/memory';
+ import { PostgresStore, fixedWindow, gcra, tokenBucket } from '@limitkit/postgres';
```

A month-long budget wants a durable store: Postgres or Redis with persistence, not a cache that may evict a user's remaining quota.
