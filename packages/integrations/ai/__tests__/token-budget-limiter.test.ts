import { RateLimiter } from '@limitkit/core';
import { InMemoryStore, tokenBucket } from '@limitkit/memory';
import {
  extractAnthropicUsage,
  extractOpenAIUsage,
  modelWeightedCost,
  monthlyTokenBudget,
} from '../src';

interface Ctx {
  userId: string;
  model: string;
  tokens: number;
}

const buildLimiter = (tokens: number) =>
  new RateLimiter<Ctx>({
    store: new InMemoryStore(),
    rules: [
      {
        name: 'monthly-tokens',
        key: (ctx) => 'acc:' + ctx.userId,
        cost: (ctx) => ctx.tokens,
        policy: tokenBucket(monthlyTokenBudget({ tokens })),
      },
    ],
  });

describe('token budgets end to end', () => {
  it('lets a user spend up to the budget and then refuses', async () => {
    const limiter = buildLimiter(1_000);

    const first = await limiter.consume({
      userId: 'u1',
      model: 'gpt-4o',
      tokens: 600,
    });
    expect(first.allowed).toBe(true);
    expect(first.rules[0].remaining).toBe(400);

    const second = await limiter.consume({
      userId: 'u1',
      model: 'gpt-4o',
      tokens: 300,
    });
    expect(second.allowed).toBe(true);
    expect(second.rules[0].remaining).toBe(100);

    // 200 more tokens would overrun the remaining 100.
    const third = await limiter.consume({
      userId: 'u1',
      model: 'gpt-4o',
      tokens: 200,
    });
    expect(third.allowed).toBe(false);
    expect(third.failedRule).toBe('monthly-tokens');
  });

  it('budgets each user separately', async () => {
    const limiter = buildLimiter(1_000);

    await limiter.consume({ userId: 'u1', model: 'gpt-4o', tokens: 1_000 });

    const exhausted = await limiter.consume({
      userId: 'u1',
      model: 'gpt-4o',
      tokens: 1,
    });
    expect(exhausted.allowed).toBe(false);

    const other = await limiter.consume({
      userId: 'u2',
      model: 'gpt-4o',
      tokens: 1_000,
    });
    expect(other.allowed).toBe(true);
  });

  it('drains the budget faster on a heavier-weighted model', async () => {
    const limiter = new RateLimiter<Ctx>({
      store: new InMemoryStore(),
      rules: [
        {
          name: 'monthly-tokens',
          key: (ctx) => 'acc:' + ctx.userId,
          cost: modelWeightedCost<Ctx>({
            weights: { 'gpt-4o': 10, 'gpt-4o-mini': 1 },
            model: (ctx) => ctx.model,
            tokens: (ctx) => ctx.tokens,
          }),
          policy: tokenBucket(monthlyTokenBudget({ tokens: 1_000 })),
        },
      ],
    });

    // 100 mini tokens cost 100; 100 gpt-4o tokens cost 1,000.
    const mini = await limiter.consume({
      userId: 'u1',
      model: 'gpt-4o-mini',
      tokens: 100,
    });
    expect(mini.rules[0].remaining).toBe(900);

    const frontier = await limiter.consume({
      userId: 'u1',
      model: 'gpt-4o',
      tokens: 100,
    });
    expect(frontier.allowed).toBe(false);
  });

  it('charges usage read straight off a provider response', async () => {
    const limiter = buildLimiter(1_000);

    const openai = extractOpenAIUsage({
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    });
    const anthropic = extractAnthropicUsage({
      usage: {
        input_tokens: 100,
        cache_read_input_tokens: 400,
        output_tokens: 50,
      },
    });

    const first = await limiter.consume({
      userId: 'u1',
      model: 'gpt-4o',
      tokens: openai.totalTokens,
    });
    expect(first.rules[0].remaining).toBe(850);

    // 100 uncached + 400 cached input + 50 output = 550.
    const second = await limiter.consume({
      userId: 'u1',
      model: 'claude-opus-4-8',
      tokens: anthropic.totalTokens,
    });
    expect(second.allowed).toBe(true);
    expect(second.rules[0].remaining).toBe(300);
  });
});
