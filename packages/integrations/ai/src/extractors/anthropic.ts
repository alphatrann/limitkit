import { AnthropicResponse, TokenUsage } from '../types';
import { toTokenCount } from '../utils';

/**
 * Read token usage from an Anthropic Messages API response.
 *
 * @example
 * ```ts
 * const message = await anthropic.messages.create({ ... });
 * const usage = extractAnthropicUsage(message);
 *
 * await limiter.consume({ userId, tokens: usage.totalTokens });
 * ```
 *
 * @param response A response from `/v1/messages`.
 * @returns Normalized usage. All counts are `0` if the response carries none.
 */
export function extractAnthropicUsage(response: AnthropicResponse): TokenUsage {
  const usage = response?.usage;

  const uncachedInputTokens = toTokenCount(usage?.input_tokens);
  const cachedInputTokens = toTokenCount(usage?.cache_read_input_tokens);
  const cacheWriteTokens = toTokenCount(usage?.cache_creation_input_tokens);
  const outputTokens = toTokenCount(usage?.output_tokens);

  // Anthropic's `input_tokens` is the uncached remainder only — the full prompt
  // is `input_tokens + cache_read_input_tokens + cache_creation_input_tokens`.
  // OpenAI's `prompt_tokens` already includes its cached tokens. Add the cache
  // counters back so `inputTokens` means the same thing for both providers.
  const inputTokens =
    uncachedInputTokens + cachedInputTokens + cacheWriteTokens;

  return {
    inputTokens,
    outputTokens,
    cachedInputTokens,
    totalTokens: inputTokens + outputTokens,
  };
}
