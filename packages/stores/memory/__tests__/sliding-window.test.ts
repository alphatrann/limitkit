import { BadArgumentsException, SlidingWindowConfig } from "@limitkit/core";
import { InMemorySlidingWindow } from "../src";

describe("InMemorySlidingWindow", () => {
  const config: SlidingWindowConfig = {
    name: "sliding-window",
    limit: 3,
    window: 10,
  };
  let limiter: InMemorySlidingWindow;
  const base = 1000000;

  beforeEach(() => {
    limiter = new InMemorySlidingWindow(config);
  });

  test("allows requests within limit", () => {
    let state;

    const r1 = limiter.process(state, base);
    state = r1.state;
    const r2 = limiter.process(state, base + 1000);
    state = r2.state;
    const r3 = limiter.process(state, base + 2000);

    expect(r1.output.allowed).toBe(true);
    expect(r2.output.allowed).toBe(true);
    expect(r3.output.allowed).toBe(true);
    expect(r3.output.remaining).toBe(0);
  });

  test("rejects when limit exceeded", () => {
    let state;

    for (let i = 0; i < 3; i++) {
      const r = limiter.process(state, base);
      state = r.state;
    }

    const r = limiter.process(state, base);
    expect(r.output.allowed).toBe(false);
    expect(r.output.retryAfter).toBeGreaterThan(0);
  });

  test("expired entries are removed", () => {
    let state;

    const r1 = limiter.process(state, base);
    state = r1.state;

    const r2 = limiter.process(state, base + 11000);
    expect(r2.output.allowed).toBe(true);
    expect(r2.state.size).toBe(1);
  });

  test("reset equals newest + window", () => {
    let state;

    const r = limiter.process(state, base);
    expect(r.output.reset).toBe(base + 10000);
  });

  test("concurrent burst obeys limit", () => {
    let state;
    let allowed = 0;

    for (let i = 0; i < 10; i++) {
      const r = limiter.process(state, base);
      state = r.state;
      if (r.output.allowed) allowed++;
    }

    expect(allowed).toBe(3);
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
