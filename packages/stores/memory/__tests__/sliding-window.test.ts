import { Algorithm, SlidingWindowConfig } from "@limitkit/core";
import { slidingWindow } from "../src";

describe("Sliding window unit tests", () => {
  const limit = 5;
  const window = 10;

  function createState() {
    return {
      buffer: new Array(limit),
      head: 0,
      size: 0,
    };
  }

  const config: SlidingWindowConfig = {
    name: Algorithm.SlidingWindow,
    limit,
    window,
  };

  it("first request should pass", () => {
    const state = createState();
    const now = 1000;

    const result = slidingWindow(state, config, now, 1);

    expect(result.output.allowed).toBe(true);
    expect(result.output.remaining).toBe(4);
    expect(result.output.reset).toBe(now + window * 1000);
  });

  it("requests up to limit should pass", () => {
    const state = createState();

    for (let i = 0; i < limit; i++) {
      const res = slidingWindow(state, config, 1000 + i, 1);
      expect(res.output.allowed).toBe(true);
    }

    expect(state.size).toBe(limit);
  });

  it("request exceeding limit should be denied", () => {
    const state = createState();

    for (let i = 0; i < limit; i++) {
      slidingWindow(state, config, 1000 + i, 1);
    }

    const res = slidingWindow(state, config, 2000, 1);

    expect(res.output.allowed).toBe(false);
    expect(res.output.remaining).toBe(0);
    expect(res.output.retryAfter).toBeGreaterThan(0);
  });

  it("request allowed after window passes", () => {
    const state = createState();

    for (let i = 0; i < limit; i++) {
      slidingWindow(state, config, i * 1000, 1);
    }

    const now = 11000;

    const res = slidingWindow(state, config, now, 1);

    expect(res.output.allowed).toBe(true);
  });

  it("multiple timestamps expire correctly", () => {
    const state = createState();

    slidingWindow(state, config, 0, 1);
    slidingWindow(state, config, 1000, 1);
    slidingWindow(state, config, 2000, 1);

    const res = slidingWindow(state, config, 15000, 1);

    expect(res.output.allowed).toBe(true);
    expect(state.size).toBe(1);
  });

  it("request with cost should consume multiple slots", () => {
    const state = createState();

    const res = slidingWindow(state, config, 1000, 3);

    expect(res.output.allowed).toBe(true);
    expect(state.size).toBe(3);
    expect(res.output.remaining).toBe(2);
  });

  it("cost exceeding remaining capacity should be rejected", () => {
    const state = createState();

    slidingWindow(state, config, 1000, 4);

    const res = slidingWindow(state, config, 2000, 2);

    expect(res.output.allowed).toBe(false);
  });

  it("reset equals newest timestamp + window", () => {
    const state = createState();

    slidingWindow(state, config, 1000, 1);
    slidingWindow(state, config, 2000, 1);

    const res = slidingWindow(state, config, 2000, 1);

    const expectedReset = 2000 + window * 1000;

    expect(res.output.reset).toBe(expectedReset);
  });

  it("retryAfter is based on oldest request", () => {
    const state = createState();

    slidingWindow(state, config, 0, 5);

    const res = slidingWindow(state, config, 1000, 1);

    expect(res.output.allowed).toBe(false);
    expect(res.output.retryAfter).toBeGreaterThan(0);
  });

  it("buffer wraps correctly", () => {
    const state = createState();

    for (let i = 0; i < limit; i++) {
      slidingWindow(state, config, i * 1000, 1);
    }

    slidingWindow(state, config, 6000, 1);

    expect(state.size).toBe(limit);
  });

  it("request exactly at window boundary is allowed", () => {
    const state = createState();

    slidingWindow(state, config, 0, 1);

    const res = slidingWindow(state, config, 10000, 1);

    expect(res.output.allowed).toBe(true);
  });

  it("state object should be reused", () => {
    const state = createState();

    slidingWindow(state, config, 1000, 1);

    expect(state.size).toBe(1);
  });
});
