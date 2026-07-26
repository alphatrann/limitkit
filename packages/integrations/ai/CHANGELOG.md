# @limitkit/ai

## 0.1.0

### Minor Changes

- Add `@limitkit/ai`, LLM token usage extraction and token-budget policies for LimitKit.

  - `extractOpenAIUsage`, `extractAnthropicUsage`, `extractOllamaUsage`, `extractHuggingFaceUsage` pull normalized token counts out of a provider's response, read structurally so no provider SDK is required.
  - `monthlyTokenBudget`, `weeklyTokenBudget`, `sessionTokenBudget`, and a model-tiered cost-weighting preset turn a token allowance into a `tokenBucket` policy, depending only on `@limitkit/core`.

  See `examples/llm-gateway` for a runnable Express server demonstrating layered rate limits (IP, per-user monthly token budget, per-plan burst) across OpenAI, Anthropic, Ollama, and Hugging Face.
