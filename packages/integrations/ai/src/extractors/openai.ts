import { OpenAIResponse, TokenUsage } from '../types';
import { toTokenCount } from '../utils';

/**
 * Read token usage from an OpenAI response.
 *
 * Handles both current surfaces: the **Chat Completions** API
 * (`prompt_tokens` / `completion_tokens`) and the **Responses** API
 * (`input_tokens` / `output_tokens`), which renames the same counters.
 *
 * @example
 * ```ts
 * const completion = await openai.chat.completions.create({ ... });
 * const usage = extractOpenAIUsage(completion);
 *
 * await limiter.consume({ userId, tokens: usage.totalTokens });
 * ```
 *
 * @param response A response from `/v1/chat/completions` or `/v1/responses`.
 * @returns Normalized usage. All counts are `0` if the response carries none.
 */
export function extractOpenAIUsage(response: OpenAIResponse): TokenUsage {
  const usage = response?.usage;

  const inputTokens = toTokenCount(usage?.prompt_tokens ?? usage?.input_tokens);
  const outputTokens = toTokenCount(
    usage?.completion_tokens ?? usage?.output_tokens,
  );

  // OpenAI already counts cached tokens inside the input total on both
  // surfaces, so this is a breakdown of `inputTokens`, not an addition to it.
  const cachedInputTokens = toTokenCount(
    usage?.prompt_tokens_details?.cached_tokens ??
      usage?.input_tokens_details?.cached_tokens,
  );

  const reportedTotal = toTokenCount(usage?.total_tokens);

  return {
    inputTokens,
    outputTokens,
    cachedInputTokens,
    totalTokens: reportedTotal || inputTokens + outputTokens,
  };
}
