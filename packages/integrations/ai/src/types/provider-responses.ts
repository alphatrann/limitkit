/**
 * Structural types for the provider responses this package can read.
 *
 * These describe the wire format only — the fields the extractors touch — so
 * `@limitkit/ai` never depends on a provider SDK. A response object from
 * `openai`, `@anthropic-ai/sdk`, `ollama`, or a plain `fetch().json()` is
 * assignable to the matching interface without a cast.
 *
 * Every field is optional: providers omit usage on streamed chunks, on errors,
 * and (for Ollama) on some cache hits. The extractors treat a missing count
 * as `0` rather than throwing.
 */

/**
 * Usage as reported by the OpenAI **Chat Completions** API
 * (`POST /v1/chat/completions`).
 */
export interface OpenAIChatCompletionUsage {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
  prompt_tokens_details?: {
    cached_tokens?: number | null;
  } | null;
}

/**
 * Usage as reported by the OpenAI **Responses** API (`POST /v1/responses`),
 * which renames the counters rather than reusing the Chat Completions names.
 */
export interface OpenAIResponsesUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  total_tokens?: number | null;
  input_tokens_details?: {
    cached_tokens?: number | null;
  } | null;
}

/**
 * An OpenAI response from either the Chat Completions or the Responses API.
 */
export interface OpenAIResponse {
  usage?: (OpenAIChatCompletionUsage & OpenAIResponsesUsage) | null;
}

/**
 * Usage as reported by the Anthropic Messages API (`POST /v1/messages`).
 */
export interface AnthropicUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/**
 * A response from the Anthropic Messages API.
 */
export interface AnthropicResponse {
  usage?: AnthropicUsage | null;
}

/**
 * A response from Ollama's `/api/chat` or `/api/generate` endpoints, which
 * report token counts as top-level `*_count` fields rather than a `usage`
 * object.
 */
export interface OllamaResponse {
  prompt_eval_count?: number | null;
  eval_count?: number | null;
}

/**
 * Usage as reported by Hugging Face Inference Providers' chat-completion route,
 * which is OpenAI-compatible.
 */
export interface HuggingFaceUsage {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
}

/**
 * A response from Hugging Face Inference Providers' chat-completion route.
 */
export interface HuggingFaceResponse {
  usage?: HuggingFaceUsage | null;
}
