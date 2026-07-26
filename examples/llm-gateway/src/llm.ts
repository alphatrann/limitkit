import { Completion, ProviderName } from './providers/types';
import { completeOpenAI } from './providers/openai';
import { completeAnthropic } from './providers/anthropic';
import { completeOllama } from './providers/ollama';
import { completeHuggingFace } from './providers/hugging-face';

export type { Completion, ProviderName } from './providers/types';
export { PROVIDERS } from './providers/types';

/**
 * Dispatch a chat completion to the given provider's SDK.
 *
 * Every provider falls back to a stub completion when its credentials aren't
 * set (or, for Ollama, when the local daemon isn't reachable) — so the whole
 * gateway runs and rate-limits correctly with no keys and no network.
 */
export async function complete(
  provider: ProviderName,
  model: string,
  prompt: string,
): Promise<Completion> {
  switch (provider) {
    case 'openai':
      return completeOpenAI(model, prompt);
    case 'anthropic':
      return completeAnthropic(model, prompt);
    case 'ollama':
      return completeOllama(model, prompt);
    case 'huggingface':
      return completeHuggingFace(model, prompt);
  }
}
