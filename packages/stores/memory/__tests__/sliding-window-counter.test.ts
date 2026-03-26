import { BadArgumentsException } from "@limitkit/core";
import { InMemorySlidingWindowCounter, slidingWindowCounter } from "../src";

describe("InMemorySlidingWindowCounter", () => {
  const config = {
    limit: 10,
    window: 10,
  };
  let limiter: InMemorySlidingWindowCounter;
  const base = 1000000;

  beforeEach(() => {
    limiter = slidingWindowCounter(config);
  });

  test("allows requests within limit", () => {
    let state;

    for (let i = 0; i < 5; i++) {
      const r = limiter.process(state, base + i * 100);
      state = r.state;
      expect(r.output.allowed).toBe(true);
      expect(r.output.remaining).toBe(config.limit - i - 1);
      expect(r.state.count).toBe(i + 1);
    }
  });

  test("rejects when effective limit exceeded", () => {
    let state;

    for (let i = 0; i < config.limit; i++) {
      const r = limiter.process(state, base);
      state = r.state;
    }

    const r = limiter.process(state, base + 1000);
    expect(r.output.allowed).toBe(false);
    expect(r.output.resetAt).toBe(base + 2 * config.window * 1000);
    expect(r.output.availableAt).toBe(base + config.window * 1000);
  });

  test("window rollover works", () => {
    let state;

    const r1 = limiter.process(state, base);
    state = r1.state;

    const r2 = limiter.process(state, base + 11000);
    expect(r2.output.allowed).toBe(true);
  });

  test("effective calculation uses previous window", () => {
    let state;

    for (let i = 0; i < config.limit; i++) {
      const r = limiter.process(state, base);
      state = r.state;
    }

    const mid = base + 5000;

    const r = limiter.process(state, mid);

    expect(r.output.allowed).toBe(false);
  });

  test("large time jump clears previous window", () => {
    let state;

    const r1 = limiter.process(state, base);
    state = r1.state;

    const r2 = limiter.process(state, base + 60000);
    expect(r2.output.allowed).toBe(true);
  });

  test("cost increments correctly", () => {
    let state;

    const r = limiter.process(state, base, 3);
    expect(r.state.count).toBe(3);
  });

  test("throws if cost exceeds limit", () => {
    expect(() => limiter.process(undefined, base, 20)).toThrow(
      BadArgumentsException,
    );
  });
});
