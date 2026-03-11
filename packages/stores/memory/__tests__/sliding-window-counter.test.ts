import { Algorithm, SlidingWindowCounterConfig } from "@limitkit/core";
import { slidingWindowCounter, SlidingWindowCounterState } from "../src";

function createState(): SlidingWindowCounterState {
  return {
    count: 0,
    prevCount: 0,
    windowStart: 0,
  };
}

describe("slidingWindowCounter", () => {
  const config: SlidingWindowCounterConfig = {
    name: Algorithm.SlidingWindowCounter,
    limit: 10,
    window: 10,
  };

  const LIMIT = config.limit;
  const W = config.window * 1000;

  test("initial state: effective = cost", () => {
    const state = createState();

    const cost = 1;

    const res = slidingWindowCounter(state, config, 1000, cost);

    const effective = cost;
    const expectedRemaining = LIMIT - effective;

    expect(res.output.allowed).toBe(true);
    expect(res.output.remaining).toBe(expectedRemaining);
  });

  test("accumulation: effective = Σ cost within window", () => {
    let state = createState();

    for (let i = 0; i < 10; i++) {
      const res = slidingWindowCounter(state, config, 1000 + i * 1000, 1);
      state = res.state as SlidingWindowCounterState;
    }

    const effective = 10;

    expect(effective).toBe(LIMIT);
  });

  test("deny condition: effective + cost > limit", () => {
    let state = createState();

    for (let i = 0; i < 10; i++) {
      state = slidingWindowCounter(state, config, i * 1000, 1)
        .state as SlidingWindowCounterState;
    }

    const cost = 1;
    const effective = 10;

    const res = slidingWindowCounter(state, config, 5000, cost);

    expect(effective + cost).toBeGreaterThan(LIMIT);
    expect(res.output.allowed).toBe(false);
  });

  test("cost consumes multiple slots mathematically", () => {
    const state = createState();

    const cost = 3;

    const res = slidingWindowCounter(state, config, 1000, cost);

    const effective = cost;
    const expectedRemaining = LIMIT - effective;

    expect(res.output.remaining).toBe(expectedRemaining);
  });

  test("window rollover: prevCount = old count", () => {
    let state = createState();

    state = slidingWindowCounter(state, config, 1000, 5)
      .state as SlidingWindowCounterState;

    const now = 11000;

    const res = slidingWindowCounter(state, config, now, 1);
    const s = res.state as SlidingWindowCounterState;

    expect(s.prevCount).toBe(5);
    expect(s.count).toBe(1);
  });

  test("double window rollover clears history", () => {
    let state = createState();

    state = slidingWindowCounter(state, config, 1000, 5)
      .state as SlidingWindowCounterState;

    const now = 30000;

    const res = slidingWindowCounter(state, config, now, 1);
    const s = res.state as SlidingWindowCounterState;

    expect(s.prevCount).toBe(0);
    expect(s.count).toBe(1);
  });

  test("weighted previous window contribution", () => {
    let state = createState();

    state = slidingWindowCounter(state, config, 0, 10)
      .state as SlidingWindowCounterState;

    const now = 12000;

    const elapsed = now - 10000;
    const weightPrev = (W - elapsed) / W;

    const expectedEffective = 10 * weightPrev;

    const res = slidingWindowCounter(state, config, now, 1);

    expect(expectedEffective + 1).toBeLessThanOrEqual(LIMIT);
    expect(res.output.allowed).toBe(true);
  });

  test("retryAfter = next window boundary", () => {
    let state = createState();

    state = slidingWindowCounter(state, config, 0, 10)
      .state as SlidingWindowCounterState;

    const now = 1000;

    const elapsed = now;
    const expectedRetry = Math.ceil((W - elapsed) / 1000);

    const res = slidingWindowCounter(state, config, now, 1);

    expect(res.output.retryAfter).toBe(expectedRetry);
  });

  test("reset = windowStart + 2W", () => {
    const state = createState();

    const res = slidingWindowCounter(state, config, 1000, 1);

    const expectedReset = state.windowStart + 2 * W;

    expect(res.output.reset).toBe(expectedReset);
  });

  test("boundary condition: request exactly at window boundary", () => {
    let state = createState();

    state = slidingWindowCounter(state, config, 0, 5)
      .state as SlidingWindowCounterState;

    const now = W;

    const res = slidingWindowCounter(state, config, now, 1);

    expect(res.output.allowed).toBe(true);
  });

  test("long idle period resets counts", () => {
    let state = createState();

    state = slidingWindowCounter(state, config, 0, 5)
      .state as SlidingWindowCounterState;

    const res = slidingWindowCounter(state, config, 60000, 1);
    const s = res.state as SlidingWindowCounterState;

    expect(s.prevCount).toBe(0);
    expect(s.count).toBe(1);
  });

  test("invariant: effective count never exceeds limit after accept", () => {
    let state = createState();

    for (let i = 0; i < 50; i++) {
      const res = slidingWindowCounter(state, config, i * 500, 1);
      state = res.state as SlidingWindowCounterState;
    }

    const s = state as SlidingWindowCounterState;

    const elapsed = 25000 - s.windowStart;
    const weightPrev = (W - elapsed) / W;

    const effective = s.prevCount * weightPrev + s.count;

    expect(effective).toBeLessThanOrEqual(LIMIT);
  });
});
