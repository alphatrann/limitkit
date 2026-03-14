import {
  BadArgumentsException,
  SlidingWindowCounterConfig,
} from "@limitkit/core";
import { InMemorySlidingWindowCounter } from "../src";

describe("InMemorySlidingWindowCounter", () => {
  const config: SlidingWindowCounterConfig = {
    name: "sliding-window-counter",
    limit: 10,
    window: 10,
  };
  let limiter: InMemorySlidingWindowCounter;
  const base = 1000000;

  beforeEach(() => {
    limiter = new InMemorySlidingWindowCounter(config);
  });

  test("allows requests within limit", () => {
    let state;

    for (let i = 0; i < 5; i++) {
      const r = limiter.process(state, base);
      state = r.state;
      expect(r.output.allowed).toBe(true);
    }
  });

  test("rejects when effective limit exceeded", () => {
    let state;

    for (let i = 0; i < 10; i++) {
      const r = limiter.process(state, base);
      state = r.state;
    }

    const r = limiter.process(state, base + 1000);
    expect(r.output.allowed).toBe(false);
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

    for (let i = 0; i < 10; i++) {
      const r = limiter.process(state, base);
      state = r.state;
    }

    const mid = base + 5000;

    const r = limiter.process(state, mid);

    expect(r.output.allowed).toBe(false);
  });

  test("reset equals full replenishment", () => {
    const r = limiter.process(undefined, base);

    expect(r.output.reset).toBe(base + 20000);
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
