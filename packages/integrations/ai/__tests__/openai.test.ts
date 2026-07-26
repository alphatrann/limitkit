import { extractOpenAIUsage } from '../src';

describe('extractOpenAIUsage', () => {
  it('reads Chat Completions usage', () => {
    const usage = extractOpenAIUsage({
      usage: {
        prompt_tokens: 120,
        completion_tokens: 80,
        total_tokens: 200,
      },
    });

    expect(usage).toEqual({
      inputTokens: 120,
      outputTokens: 80,
      totalTokens: 200,
      cachedInputTokens: 0,
    });
  });

  it('reads Responses API usage, which renames the counters', () => {
    const usage = extractOpenAIUsage({
      usage: {
        input_tokens: 120,
        output_tokens: 80,
        total_tokens: 200,
      },
    });

    expect(usage).toEqual({
      inputTokens: 120,
      outputTokens: 80,
      totalTokens: 200,
      cachedInputTokens: 0,
    });
  });

  it('reports cached prompt tokens as a breakdown of the input total', () => {
    const usage = extractOpenAIUsage({
      usage: {
        prompt_tokens: 1000,
        completion_tokens: 50,
        total_tokens: 1050,
        prompt_tokens_details: { cached_tokens: 900 },
      },
    });

    // OpenAI already counts the 900 cached tokens inside prompt_tokens, so the
    // input total must not grow.
    expect(usage.inputTokens).toBe(1000);
    expect(usage.cachedInputTokens).toBe(900);
    expect(usage.totalTokens).toBe(1050);
  });

  it('reads cached tokens from the Responses API details object', () => {
    const usage = extractOpenAIUsage({
      usage: {
        input_tokens: 1000,
        output_tokens: 50,
        input_tokens_details: { cached_tokens: 640 },
      },
    });

    expect(usage.cachedInputTokens).toBe(640);
  });

  it('derives the total when the provider omits it', () => {
    const usage = extractOpenAIUsage({
      usage: { prompt_tokens: 30, completion_tokens: 12 },
    });

    expect(usage.totalTokens).toBe(42);
  });

  it('returns zeroes for a response with no usage', () => {
    expect(extractOpenAIUsage({})).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cachedInputTokens: 0,
    });
    expect(extractOpenAIUsage({ usage: null })).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cachedInputTokens: 0,
    });
  });

  it('collapses malformed counts to zero rather than throwing', () => {
    const usage = extractOpenAIUsage({
      usage: { prompt_tokens: -5, completion_tokens: null, total_tokens: NaN },
    });

    expect(usage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cachedInputTokens: 0,
    });
  });
});
