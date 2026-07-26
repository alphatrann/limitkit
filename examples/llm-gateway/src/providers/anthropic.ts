import Anthropic from '@anthropic-ai/sdk';
import { extractAnthropicUsage } from '@limitkit/ai';
import { Completion } from './types';

let client: Anthropic | undefined;

function getClient(apiKey: string): Anthropic {
  client ??= new Anthropic({ apiKey });
  return client;
}

/** Calls Anthropic via `@anthropic-ai/sdk`, or stubs if no key is set. */
export async function completeAnthropic(
  model: string,
  prompt: string,
): Promise<Completion> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return stub(model, prompt);

  const message = await getClient(apiKey).messages.create({
    model,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = message.content.find(
    (block): block is Anthropic.TextBlock => block.type === 'text',
  );

  return {
    content: textBlock?.text ?? '',
    usage: extractAnthropicUsage(message),
  };
}

function stub(model: string, prompt: string): Completion {
  const promptTokens = Math.max(1, Math.ceil(prompt.length / 4));
  const completionTokens = promptTokens * 3;

  return {
    content: `[stubbed anthropic/${model} reply] Set ANTHROPIC_API_KEY to call the real API.`,
    usage: {
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      cachedInputTokens: 0,
      totalTokens: promptTokens + completionTokens,
    },
  };
}
