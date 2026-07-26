/**
 * A toy user directory. Swap for your real one.
 */
export type PlanName = 'free' | 'pro';

export interface Plan {
  /** Tokens the user may spend per 30-day month. */
  monthlyTokens: number;
  /** Requests allowed per minute, to stop one user hogging the upstream. */
  requestsPerMinute: number;
}

export const PLANS: Record<PlanName, Plan> = {
  free: { monthlyTokens: 50_000, requestsPerMinute: 5 },
  pro: { monthlyTokens: 2_000_000, requestsPerMinute: 60 },
};

export interface User {
  id: string;
  plan: PlanName;
}

const USERS: Record<string, User> = {
  'key-free': { id: 'user-free', plan: 'free' },
  'key-pro': { id: 'user-pro', plan: 'pro' },
};

export function authenticate(apiKey: string | undefined): User | undefined {
  if (!apiKey) return undefined;
  return USERS[apiKey];
}

/**
 * Cost multipliers per "provider/model". A frontier model's tokens are worth
 * many times a small model's, so one budget can govern all providers. Keyed
 * by provider since model names aren't unique across them.
 */
export const MODEL_WEIGHTS: Record<string, number> = {
  'openai/gpt-5.6-sol': 15,
  'openai/gpt-5.6-luna': 8,
  'anthropic/claude-opus-5': 20,
  'anthropic/claude-sonnet-5': 8,
  'anthropic/claude-haiku-4-5': 5,
  'ollama/qwen2.5:7b-instruct': 1,
  'huggingface/Qwen/Qwen2.5-7B-Instruct': 1,
};
