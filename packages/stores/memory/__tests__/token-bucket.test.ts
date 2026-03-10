import { Algorithm, TokenBucketConfig } from "@limitkit/core";
import { tokenBucket, TokenBucketState } from "../src";

const config: TokenBucketConfig = {
  name: Algorithm.TokenBucket,
  capacity: 10,
  refillRate: 2, // tokens per second
  initialTokens: 10,
};

function createState(): TokenBucketState {
  return {
    tokens: 0,
    lastRefill: null,
  };
}

describe("tokenBucket", () => {
  test("initial request initializes tokens", () => {
    const state = createState();

    const result = tokenBucket(state, config, 1000, 1);

    expect(result.output.allowed).toBe(true);
    expect((result.state as TokenBucketState).tokens).toBe(9);
  });

  test("burst up to capacity allowed", () => {
    let state = createState();

    for (let i = 0; i < 10; i++) {
      const res = tokenBucket(state, config, 1000, 1);
      expect(res.output.allowed).toBe(true);
      state = res.state as TokenBucketState;
    }

    expect(state.tokens).toBe(0);
  });

  test("request rejected when bucket empty", () => {
    let state = createState();

    state = tokenBucket(state, config, 1000, 10).state as TokenBucketState;

    const res = tokenBucket(state, config, 1000, 1);

    expect(res.output.allowed).toBe(false);
    expect(res.output.retryAfter).toBeGreaterThan(0);
  });

  test("tokens refill over time", () => {
    let state = createState();

    state = tokenBucket(state, config, 1000, 10).state as TokenBucketState;

    const res = tokenBucket(state, config, 2000, 1);

    expect(res.output.allowed).toBe(true);
  });

  test("partial refill should not allow request too early", () => {
    let state = createState();

    state = tokenBucket(state, config, 1000, 10).state as TokenBucketState;

    const res = tokenBucket(state, config, 1500, 2);

    expect(res.output.allowed).toBe(false);
  });

  test("refill should not exceed capacity", () => {
    let state = createState();

    state = tokenBucket(state, config, 1000, 5).state as TokenBucketState;

    const res = tokenBucket(state, config, 20000, 1);

    expect((res.state as TokenBucketState).tokens).toBeLessThanOrEqual(
      config.capacity,
    );
  });

  test("cost consumes multiple tokens", () => {
    let state = createState();

    const res = tokenBucket(state, config, 1000, 3);

    expect(res.output.allowed).toBe(true);
    expect((res.state as TokenBucketState).tokens).toBe(7);
  });

  test("cost larger than available tokens should reject", () => {
    let state = createState();

    state = tokenBucket(state, config, 1000, 9).state as TokenBucketState;

    const res = tokenBucket(state, config, 1000, 5);

    expect(res.output.allowed).toBe(false);
  });

  test("retryAfter reflects token wait time", () => {
    let state = createState();

    state = tokenBucket(state, config, 1000, 10).state as TokenBucketState;

    const res = tokenBucket(state, config, 1000, 1);

    expect(res.output.retryAfter).toBeGreaterThan(0);
  });

  test("reset indicates time when bucket becomes full", () => {
    let state = createState();

    state = tokenBucket(state, config, 1000, 5).state as TokenBucketState;

    const res = tokenBucket(state, config, 1000, 1);

    expect(res.output.reset).toBeGreaterThan(1000);
  });

  test("large time jump refills bucket fully", () => {
    let state = createState();

    state = tokenBucket(state, config, 1000, 10).state as TokenBucketState;

    const res = tokenBucket(state, config, 100000, 1);

    expect(res.output.allowed).toBe(true);
  });

  test("remaining tokens reported correctly", () => {
    let state = createState();

    const res = tokenBucket(state, config, 1000, 4);

    expect(res.output.remaining).toBe(6);
  });
});
