import { TokenUsage } from '@limitkit/ai';

/** What every provider module normalizes its response down to. */
export interface Completion {
  content: string;
  usage: TokenUsage;
}

export type ProviderName = 'openai' | 'anthropic' | 'ollama' | 'huggingface';

export const PROVIDERS: ProviderName[] = [
  'openai',
  'anthropic',
  'ollama',
  'huggingface',
];
