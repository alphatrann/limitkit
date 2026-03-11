import { Algorithm, TokenBucketConfig } from "@limitkit/core";
import { tokenBucket, TokenBucketState } from "../src";

const config: TokenBucketConfig = {
  name: Algorithm.TokenBucket,
  capacity: 10,
  refillRate: 2, // tokens per second
};

const RATE = config.refillRate;
const CAP = config.capacity;

function createState(): TokenBucketState {
  return {
    tokens: 0,
    lastRefill: null,
  };
}

describe("tokenBucket", () => {
  test("initialization: tokens = capacity - cost", () => {
    const state = createState();

    const res = tokenBucket(state, config, 1000, 1);

    const expected = CAP - 1;

    expect(res.output.allowed).toBe(true);
    expect((res.state as TokenBucketState).tokens).toBe(expected);
  });

  test("burst capacity invariant", () => {
    let state = createState();

    for (let i = 0; i < CAP; i++) {
      const res = tokenBucket(state, config, 1000, 1);
      state = res.state as TokenBucketState;
    }

    expect(state.tokens).toBe(0);
  });

  test("refill equation: tokens = min(cap, prev + rate * dt)", () => {
    let state = createState();

    state = tokenBucket(state, config, 1000, 10).state as TokenBucketState;

    const now = 2000;
    const dt = now - 1000;

    const refill = RATE * (dt / 1000);

    const expectedTokens = Math.min(CAP, 0 + refill) - 1;

    const res = tokenBucket(state, config, now, 1);

    expect((res.state as TokenBucketState).tokens).toBe(expectedTokens);
  });

  test("deny condition: tokens < cost", () => {
    let state = createState();

    state = tokenBucket(state, config, 1000, 9).state as TokenBucketState;

    const res = tokenBucket(state, config, 1000, 5);

    expect(res.output.allowed).toBe(false);
  });

  test("retryAfter = ceil((cost - tokens) / rate)", () => {
    let state = createState();

    state = tokenBucket(state, config, 1000, 10).state as TokenBucketState;

    const tokens = 0;
    const cost = 1;

    const expectedRetry = Math.ceil((cost - tokens) / RATE);

    const res = tokenBucket(state, config, 1000, cost);

    expect(res.output.retryAfter).toBe(expectedRetry);
  });

  test("capacity clamp: tokens never exceed capacity", () => {
    let state = createState();

    state = tokenBucket(state, config, 1000, 5).state as TokenBucketState;

    const res = tokenBucket(state, config, 20000, 1);

    const tokens = (res.state as TokenBucketState).tokens;

    expect(tokens).toBeLessThanOrEqual(CAP);
  });

  test("cost consumes exact tokens", () => {
    const state = createState();

    const cost = 3;

    const res = tokenBucket(state, config, 1000, cost);

    const expected = CAP - cost;

    expect((res.state as TokenBucketState).tokens).toBe(expected);
    expect(res.output.remaining).toBe(expected);
  });

  test("reset = time until bucket full", () => {
    let state = createState();

    const res = tokenBucket(state, config, 1000, 5);
    state = res.state as TokenBucketState;

    const tokens = 5;

    const secondsToFull = (CAP - tokens) / RATE;

    const expectedReset = 1000 + secondsToFull * 1000;

    expect(res.output.reset).toBe(expectedReset);
  });

  test("large time jump fills bucket", () => {
    let state = createState();

    state = tokenBucket(state, config, 1000, 10).state as TokenBucketState;

    const res = tokenBucket(state, config, 100000, 1);

    const tokens = (res.state as TokenBucketState).tokens;

    expect(tokens).toBe(CAP - 1);
  });

  test("token invariant: 0 ≤ tokens ≤ capacity", () => {
    let state = createState();

    for (let i = 0; i < 100; i++) {
      const res = tokenBucket(state, config, 1000 + i * 500, 1);
      state = res.state as TokenBucketState;
    }

    expect(state.tokens).toBeGreaterThanOrEqual(0);
    expect(state.tokens).toBeLessThanOrEqual(CAP);
  });
});
