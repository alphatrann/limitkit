import OpenAI from 'openai';
import { extractOpenAIUsage } from '@limitkit/ai';
import { Completion } from './types';

let client: OpenAI | undefined;

function getClient(apiKey: string): OpenAI {
  client ??= new OpenAI({ apiKey });
  return client;
}

/** Calls OpenAI via the official `openai` SDK, or stubs if no key is set. */
export async function completeOpenAI(
  model: string,
  prompt: string,
): Promise<Completion> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return stub(model, prompt);

  const response = await getClient(apiKey).responses.create({
    model,
    input: [{ role: 'user', content: prompt }],
  });

  return {
    content: response.output_text ?? 'Error: no output_text in OpenAI response',
    usage: extractOpenAIUsage(response),
  };
}

function stub(model: string, prompt: string): Completion {
  const promptTokens = Math.max(1, Math.ceil(prompt.length / 4));
  const completionTokens = promptTokens * 3;

  return {
    content: `[stubbed openai/${model} reply] Set OPENAI_API_KEY to call the real API.`,
    usage: {
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      cachedInputTokens: 0,
      totalTokens: promptTokens + completionTokens,
    },
  };
}
