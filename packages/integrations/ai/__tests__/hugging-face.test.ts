import { extractHuggingFaceUsage } from '../src';

describe('extractHuggingFaceUsage', () => {
  it('reads the OpenAI-compatible chat-completion usage', () => {
    const usage = extractHuggingFaceUsage({
      usage: {
        prompt_tokens: 45,
        completion_tokens: 155,
        total_tokens: 200,
      },
    });

    expect(usage).toEqual({
      inputTokens: 45,
      outputTokens: 155,
      totalTokens: 200,
      cachedInputTokens: 0,
    });
  });

  it('derives the total when the provider omits it', () => {
    const usage = extractHuggingFaceUsage({
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });

    expect(usage.totalTokens).toBe(15);
  });

  it('returns zeroes for a response with no usage', () => {
    expect(extractHuggingFaceUsage({})).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cachedInputTokens: 0,
    });
  });
});
