import { InferenceClient } from '@huggingface/inference';
import { extractHuggingFaceUsage } from '@limitkit/ai';
import { Completion } from './types';

let client: InferenceClient | undefined;

function getClient(token: string): InferenceClient {
  client ??= new InferenceClient(token);
  return client;
}

/**
 * Call Hugging Face Inference Providers' chat-completion route via
 * `@huggingface/inference`. Falls back to a stub if no token is set.
 */
export async function completeHuggingFace(
  model: string,
  prompt: string,
): Promise<Completion> {
  const token = process.env.HF_TOKEN;
  if (!token) return stub(model, prompt);

  const completion = await getClient(token).chatCompletion({
    model,
    messages: [{ role: 'user', content: prompt }],
  });

  return {
    content: completion.choices?.[0]?.message?.content ?? '',
    usage: extractHuggingFaceUsage(completion),
  };
}

function stub(model: string, prompt: string): Completion {
  const promptTokens = Math.max(1, Math.ceil(prompt.length / 4));
  const completionTokens = promptTokens * 3;

  return {
    content: `[stubbed huggingface/${model} reply] Set HF_TOKEN to call the real API.`,
    usage: {
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      cachedInputTokens: 0,
      totalTokens: promptTokens + completionTokens,
    },
  };
}
