import { extractAnthropicUsage } from '../src';

describe('extractAnthropicUsage', () => {
  it('reads Messages API usage', () => {
    const usage = extractAnthropicUsage({
      usage: { input_tokens: 120, output_tokens: 80 },
    });

    expect(usage).toEqual({
      inputTokens: 120,
      outputTokens: 80,
      totalTokens: 200,
      cachedInputTokens: 0,
    });
  });

  it('adds cache tokens back into the input total', () => {
    // Anthropic reports input_tokens as the *uncached remainder*, unlike
    // OpenAI. The real prompt here is 200 + 1500 + 300 = 2000 tokens.
    const usage = extractAnthropicUsage({
      usage: {
        input_tokens: 200,
        cache_read_input_tokens: 1500,
        cache_creation_input_tokens: 300,
        output_tokens: 100,
      },
    });

    expect(usage.inputTokens).toBe(2000);
    expect(usage.cachedInputTokens).toBe(1500);
    expect(usage.totalTokens).toBe(2100);
  });

  it('counts a cache write toward input but not toward cached reads', () => {
    const usage = extractAnthropicUsage({
      usage: {
        input_tokens: 10,
        cache_creation_input_tokens: 4000,
        cache_read_input_tokens: 0,
        output_tokens: 25,
      },
    });

    expect(usage.inputTokens).toBe(4010);
    expect(usage.cachedInputTokens).toBe(0);
    expect(usage.totalTokens).toBe(4035);
  });

  it('returns zeroes for a response with no usage', () => {
    expect(extractAnthropicUsage({})).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cachedInputTokens: 0,
    });
  });

  it('tolerates null cache counters', () => {
    const usage = extractAnthropicUsage({
      usage: {
        input_tokens: 50,
        output_tokens: 10,
        cache_read_input_tokens: null,
        cache_creation_input_tokens: null,
      },
    });

    expect(usage.inputTokens).toBe(50);
    expect(usage.totalTokens).toBe(60);
  });
});
