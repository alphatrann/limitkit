import { BadArgumentsException, SlidingWindowConfig } from "@limitkit/core";
import { InMemorySlidingWindow, slidingWindow } from "../src";

describe("InMemorySlidingWindow", () => {
  const config = {
    limit: 3,
    window: 10,
  };
  let limiter: InMemorySlidingWindow;
  const base = 1000000;

  beforeEach(() => {
    limiter = slidingWindow(config);
  });

  test("allows requests within limit", () => {
    let state;

    for (let i = 0; i < config.limit; i++) {
      const r = limiter.process(state, base + i * 100);
      state = r.state;
      expect(r.output.remaining).toBe(config.limit - i - 1);
      expect(r.output.allowed).toBe(true);
      expect(r.state.size).toBe(i + 1);
    }
  });

  test("rejects when limit exceeded", () => {
    let state;

    for (let i = 0; i < config.limit; i++) {
      const r = limiter.process(state, base + i * 100);
      state = r.state;
    }

    const r = limiter.process(state, base + config.limit * 100);
    expect(r.output.allowed).toBe(false);
    expect(r.output.resetAt).toBe(
      base + (config.limit - 1) * 100 + config.window * 1000,
    );
    expect(r.output.availableAt).toBe(base + config.window * 1000);
  });

  test("expired entries are removed", () => {
    let state;

    const r1 = limiter.process(state, base);
    state = r1.state;

    const r2 = limiter.process(state, base + 11000);
    expect(r2.output.allowed).toBe(true);
    expect(r2.state.size).toBe(1);
  });

  test("concurrent burst obeys limit", () => {
    let state;
    let allowed = 0;

    for (let i = 0; i < 10; i++) {
      const r = limiter.process(state, base);
      state = r.state;
      if (r.output.allowed) allowed++;
    }

    expect(allowed).toBe(config.limit);
  });

  test("large time jump clears buffer", () => {
    let state;

    const r1 = limiter.process(state, base);
    state = r1.state;

    const r2 = limiter.process(state, base + 3600000);
    expect(r2.output.allowed).toBe(true);
    expect(r2.state.size).toBe(1);
  });

  test("cost increments multiple timestamps", () => {
    let state;

    const r = limiter.process(state, base, 2);

    expect(r.state.size).toBe(2);
    expect(r.output.remaining).toBe(1);
  });

  test("throws if cost > limit", () => {
    expect(() => limiter.process(undefined, base, 4)).toThrow(
      BadArgumentsException,
    );
  });
});
