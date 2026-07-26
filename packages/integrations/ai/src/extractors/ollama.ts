import { OllamaResponse, TokenUsage } from '../types';
import { toTokenCount } from '../utils';

/**
 * Read token usage from an Ollama response.
 *
 * Ollama reports counts as top-level fields on the final response object
 * rather than in a `usage` object, and has no prompt cache — so
 * `cachedInputTokens` is always `0`.
 *
 * Note that Ollama omits `prompt_eval_count` when the prompt is fully reused
 * from the previous turn's KV cache; that shows up here as `inputTokens: 0`,
 * not as an error.
 *
 * @example
 * ```ts
 * const response = await ollama.chat({ ... });
 * const usage = extractOllamaUsage(response);
 *
 * await limiter.consume({ userId, tokens: usage.totalTokens });
 * ```
 *
 * @param response A response from `/api/chat` or `/api/generate`.
 * @returns Normalized usage. All counts are `0` if the response carries none.
 */
export function extractOllamaUsage(response: OllamaResponse): TokenUsage {
  const inputTokens = toTokenCount(response?.prompt_eval_count);
  const outputTokens = toTokenCount(response?.eval_count);

  return {
    inputTokens,
    outputTokens,
    cachedInputTokens: 0,
    totalTokens: inputTokens + outputTokens,
  };
}
