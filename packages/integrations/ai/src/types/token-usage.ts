/**
 * Token usage from an LLM call, normalized across providers.
 *
 * Every extractor in this package returns this shape, so a rule's `cost`
 * resolver can be written once and reused regardless of which provider
 * produced the response.
 *
 * @see extractOpenAIUsage
 * @see extractAnthropicUsage
 * @see extractOllamaUsage
 * @see extractHuggingFaceUsage
 */
export interface TokenUsage {
  /**
   * Tokens consumed by the prompt, **including** any served from or written to
   * a prompt cache.
   */
  inputTokens: number;

  /**
   * Tokens produced by the model. Includes reasoning/thinking tokens, which
   * providers bill as output.
   */
  outputTokens: number;

  /**
   * `inputTokens + outputTokens`. The usual value to charge a token budget.
   */
  totalTokens: number;

  /**
   * The portion of `inputTokens` that was served from a prompt cache.
   *
   * Cached input is billed at a fraction of the normal input rate, so budgets
   * that model cost rather than raw throughput may want to discount it. `0`
   * when the provider does not report caching.
   */
  cachedInputTokens: number;
}
