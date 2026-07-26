import { HuggingFaceResponse, TokenUsage } from '../types';
import { extractOpenAIUsage } from './openai';

/**
 * Read token usage from a Hugging Face Inference Providers chat-completion
 * response.
 *
 * The route is OpenAI-compatible and reports the same
 * `prompt_tokens` / `completion_tokens` / `total_tokens` counters, so this
 * delegates to {@link extractOpenAIUsage}. It exists as its own export because
 * the two are documented as separate APIs and are free to diverge; call this
 * one for Hugging Face and the divergence stays a one-file change here rather
 * than a breaking change for callers.
 *
 * Hugging Face does not report prompt caching, so `cachedInputTokens` is `0`.
 *
 * @param response A response from the Hugging Face chat-completion route.
 * @returns Normalized usage. All counts are `0` if the response carries none.
 */
export function extractHuggingFaceUsage(
  response: HuggingFaceResponse,
): TokenUsage {
  return extractOpenAIUsage(response);
}
