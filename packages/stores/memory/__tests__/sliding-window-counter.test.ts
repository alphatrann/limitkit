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

  test("first request should be allowed", () => {
    const state = createState();

    const result = slidingWindowCounter(state, config, 1000, 1);

    expect(result.output.allowed).toBe(true);
    expect(result.output.remaining).toBe(9);
  });

  test("requests up to limit are allowed", () => {
    let state = createState();

    for (let i = 0; i < 10; i++) {
      const result = slidingWindowCounter(state, config, i * 1000, 1);
      expect(result.output.allowed).toBe(true);
      state = result.state as SlidingWindowCounterState;
    }
  });

  test("request exceeding limit should be rejected", () => {
    let state = createState();

    for (let i = 0; i < 10; i++) {
      state = slidingWindowCounter(state, config, i * 1000, 1)
        .state as SlidingWindowCounterState;
    }

    const result = slidingWindowCounter(state, config, 5000, 1);

    expect(result.output.allowed).toBe(false);
    expect(result.output.remaining).toBe(0);
    expect(result.output.retryAfter).toBeGreaterThan(0);
  });

  test("cost should consume multiple requests", () => {
    const state = createState();

    const result = slidingWindowCounter(state, config, 1000, 3);

    expect(result.output.allowed).toBe(true);
    expect(result.output.remaining).toBe(7);
  });

  test("cost exceeding remaining capacity should reject", () => {
    let state = createState();

    state = slidingWindowCounter(state, config, 1000, 8)
      .state as SlidingWindowCounterState;

    const result = slidingWindowCounter(state, config, 2000, 5);

    expect(result.output.allowed).toBe(false);
  });

  test("window rollover moves count to prevCount", () => {
    let state = createState();

    state = slidingWindowCounter(state, config, 1000, 5)
      .state as SlidingWindowCounterState;

    const result = slidingWindowCounter(state, config, 11000, 1);
    const resultState = result.state as SlidingWindowCounterState;

    expect(resultState.prevCount).toBe(5);
    expect(resultState.count).toBe(1);
  });

  test("multiple window rollover clears prevCount", () => {
    let state = createState();

    state = slidingWindowCounter(state, config, 1000, 5)
      .state as SlidingWindowCounterState;

    const result = slidingWindowCounter(state, config, 30000, 1);
    const resultState = result.state as SlidingWindowCounterState;

    expect(resultState.prevCount).toBe(0);
    expect(resultState.count).toBe(1);
  });

  test("previous window weight decays over time", () => {
    let state = createState();

    state = slidingWindowCounter(state, config, 0, 10)
      .state as SlidingWindowCounterState;

    const result = slidingWindowCounter(state, config, 12000, 1);

    expect(result.output.allowed).toBe(true);
  });

  test("retryAfter should point to next window boundary", () => {
    let state = createState();

    state = slidingWindowCounter(state, config, 0, 10)
      .state as SlidingWindowCounterState;

    const result = slidingWindowCounter(state, config, 1000, 1);

    expect(result.output.allowed).toBe(false);
    expect(result.output.retryAfter).toBeGreaterThan(0);
  });

  test("reset should be two windows from windowStart", () => {
    const state = createState();

    const result = slidingWindowCounter(state, config, 1000, 1);

    const expectedReset = state.windowStart + 2 * config.window * 1000;

    expect(result.output.reset).toBe(expectedReset);
  });

  test("request exactly at window boundary should rollover", () => {
    let state = createState();

    state = slidingWindowCounter(state, config, 0, 5)
      .state as SlidingWindowCounterState;

    const result = slidingWindowCounter(state, config, 10000, 1);

    expect(result.output.allowed).toBe(true);
  });

  test("long idle period should reset counts", () => {
    let state = createState();

    state = slidingWindowCounter(state, config, 0, 5)
      .state as SlidingWindowCounterState;

    const result = slidingWindowCounter(state, config, 60000, 1);
    const resultState = result.state as SlidingWindowCounterState;

    expect(resultState.prevCount).toBe(0);
    expect(resultState.count).toBe(1);
  });
});
