import { Ollama } from 'ollama';
import { extractOllamaUsage } from '@limitkit/ai';
import { Completion } from './types';

/** No API key for local Ollama — falls back to a stub if the daemon isn't reachable. */
const client = new Ollama({ host: process.env.OLLAMA_HOST });

export async function completeOllama(
  model: string,
  prompt: string,
): Promise<Completion> {
  try {
    const response = await client.chat({
      model,
      messages: [{ role: 'user', content: prompt }],
    });

    return {
      content: response.message?.content ?? '',
      usage: extractOllamaUsage(response),
    };
  } catch {
    return stub(model, prompt);
  }
}

function stub(model: string, prompt: string): Completion {
  const promptTokens = Math.max(1, Math.ceil(prompt.length / 4));
  const completionTokens = promptTokens * 3;

  return {
    content: `[stubbed ollama/${model} reply] Run \`ollama serve\` (and \`ollama pull ${model}\`) to call the real API.`,
    usage: {
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      cachedInputTokens: 0,
      totalTokens: promptTokens + completionTokens,
    },
  };
}
