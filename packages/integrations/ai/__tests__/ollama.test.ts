import { extractOllamaUsage } from '../src';

describe('extractOllamaUsage', () => {
  it('reads the top-level eval counts', () => {
    const usage = extractOllamaUsage({
      prompt_eval_count: 26,
      eval_count: 282,
    });

    expect(usage).toEqual({
      inputTokens: 26,
      outputTokens: 282,
      totalTokens: 308,
      cachedInputTokens: 0,
    });
  });

  it('treats an omitted prompt_eval_count as zero input tokens', () => {
    // Ollama drops prompt_eval_count when the prompt is fully served from the
    // previous turn's KV cache.
    const usage = extractOllamaUsage({ eval_count: 100 });

    expect(usage.inputTokens).toBe(0);
    expect(usage.totalTokens).toBe(100);
  });

  it('returns zeroes for an empty response', () => {
    expect(extractOllamaUsage({})).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cachedInputTokens: 0,
    });
  });
});
