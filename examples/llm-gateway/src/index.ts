import { config } from 'dotenv';
import express from 'express';

config({ override: true, quiet: true });
import { admissionLimiter, GatewayContext, meteringLimiter } from './limiters';
import { complete, PROVIDERS, ProviderName } from './llm';
import { authenticate, PLANS } from './plans';

function isProvider(value: unknown): value is ProviderName {
  return PROVIDERS.includes(value as ProviderName);
}

const app = express();
app.use(express.json());

app.post('/chat', async (req, res) => {
  const user = authenticate(req.header('x-api-key'));
  if (!user) {
    res
      .status(401)
      .json({ error: 'Unknown API key. Try key-free or key-pro.' });
    return;
  }

  const { provider = 'openai', model = 'gpt-4o-mini', prompt } = req.body ?? {};
  if (typeof prompt !== 'string' || prompt.length === 0) {
    res.status(400).json({ error: 'Body must include a non-empty "prompt".' });
    return;
  }
  if (!isProvider(provider)) {
    res
      .status(400)
      .json({ error: `Unknown provider. Try one of: ${PROVIDERS.join(', ')}` });
    return;
  }

  // Model weights are keyed by "provider/model" since model names aren't
  // unique across providers (see plans.ts).
  const ctx: GatewayContext = {
    ip: req.ip ?? 'unknown',
    user,
    model: `${provider}/${model}`,
    tokens: 0,
  };

  const admission = await admissionLimiter.consume(ctx);
  if (!admission.allowed) {
    const failed = admission.rules[admission.rules.length - 1];
    res
      .status(429)
      .set('retry-after', String(retryAfterSeconds(failed.availableAt)))
      .json({
        error: 'Too many requests',
        failedRule: admission.failedRule,
        retryAt: new Date(failed.availableAt ?? failed.resetAt).toISOString(),
      });
    return;
  }

  const completion = await complete(provider, model, prompt);
  const usage = completion.usage;

  // Token counts don't exist until now, so this is the earliest point the
  // budget can be charged — and the earliest a user can be refused, which
  // means it's always the *next* request, never this one. See issue #27.
  const metering = await meteringLimiter.consume({
    ...ctx,
    tokens: usage.totalTokens,
  });
  const rule = metering.rules[0];

  // A token bucket rejects a charge it can't fully cover rather than
  // partially deducting it — so a call whose real cost exceeds what's left
  // gets served but goes uncharged, and `remaining` doesn't move. This is the
  // gap issue #27 exists to close.
  res
    .status(200)
    .set('x-tokens-used', String(usage.totalTokens))
    .set('x-tokens-remaining', String(rule.remaining))
    .json({
      provider,
      model,
      reply: completion.content,
      usage,
      budget: {
        plan: user.plan,
        monthlyTokens: PLANS[user.plan].monthlyTokens,
        remaining: rule.remaining,
        charged: metering.allowed,
      },
    });
});

function retryAfterSeconds(availableAt: number | undefined): number {
  if (!availableAt) return 1;
  return Math.max(1, Math.ceil((availableAt - Date.now()) / 1000));
}

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`llm-gateway listening on http://localhost:${port}`);
  console.log(
    [
      ['openai', Boolean(process.env.OPENAI_API_KEY)],
      ['anthropic', Boolean(process.env.ANTHROPIC_API_KEY)],
      ['huggingface', Boolean(process.env.HF_TOKEN)],
    ]
      .map(([name, live]) => `${name}: ${live ? 'live' : 'stubbed'}`)
      .concat('ollama: live if reachable, else stubbed')
      .join(' | '),
  );
});
