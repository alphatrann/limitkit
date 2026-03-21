import { BadArgumentsException } from "@limitkit/core";
import { fixedWindow, FixedWindowState, InMemoryFixedWindow } from "../src";

describe("InMemoryFixedWindow", () => {
  const config = {
    window: 10,
    limit: 5,
  };

  let limiter: InMemoryFixedWindow;

  beforeEach(() => {
    limiter = fixedWindow(config);
  });

  const baseTime = 1000 * 1000; // arbitrary timestamp

  test("allows requests within limit", () => {
    let state;

    const r1 = limiter.process(state, baseTime);
    state = r1.state;

    expect(r1.output.allowed).toBe(true);
    expect(r1.output.limit).toBe(5);
    expect(r1.output.remaining).toBe(4);

    const r2 = limiter.process(state, baseTime + 1000);
    state = r2.state;

    expect(r2.output.allowed).toBe(true);
    expect(r2.output.remaining).toBe(3);
  });

  test("rejects request when limit exceeded", () => {
    let state;

    for (let i = 0; i < config.limit; i++) {
      const r = limiter.process(state, baseTime + config.limit * 100);
      state = r.state;
      expect(r.output.allowed).toBe(true);
    }

    const r = limiter.process(state, baseTime + config.limit * 100);

    expect(r.output.allowed).toBe(false);
    expect(r.output.remaining).toBe(0);
    expect(r.output.resetAt).toBe(baseTime + config.window * 1000);
    expect(r.output.retryAt).toBe(baseTime + config.window * 1000);
  });

  test("state count increments correctly", () => {
    let state;

    const r1 = limiter.process(state, baseTime);
    state = r1.state;

    expect(state.count).toBe(1);

    const r2 = limiter.process(state, baseTime + 5000);
    state = r2.state;

    expect(state.count).toBe(2);
  });

  test("window resets when time moves to next window", () => {
    let state;

    const r1 = limiter.process(state, baseTime);
    state = r1.state;

    const nextWindow = baseTime + config.window * 1000 + 1;

    const r2 = limiter.process(state, nextWindow);
    state = r2.state;

    expect(r2.output.allowed).toBe(true);
    expect(state.count).toBe(1);
  });

  test("handles large time jumps", () => {
    let state;

    const r1 = limiter.process(state, baseTime);
    state = r1.state;

    const farFuture = baseTime + 60 * 60 * 1000; // +1 hour

    const r2 = limiter.process(state, farFuture);

    expect(r2.output.allowed).toBe(true);
    expect(r2.state.count).toBe(1);
  });

  test("cost increments correctly", () => {
    let state;

    const r = limiter.process(state, baseTime, 3);
    state = r.state;

    expect(state.count).toBe(3);
    expect(r.output.remaining).toBe(config.limit - 3);
  });

  test("rejects when cost exceeds remaining limit", () => {
    let state;

    const r1 = limiter.process(state, baseTime, 4);
    state = r1.state;

    const r2 = limiter.process(state, baseTime, 2);

    expect(r2.output.allowed).toBe(false);
  });

  test("throws when cost > limit", () => {
    expect(() => limiter.process(undefined, baseTime, 6)).toThrow(
      BadArgumentsException,
    );
  });

  test("resetAt remains stable within the same window", () => {
    let state;

    const r1 = limiter.process(state, baseTime);
    state = r1.state;

    const r2 = limiter.process(state, baseTime + 1000);

    expect(r2.output.resetAt).toBe(r1.output.resetAt);
  });

  test("request exactly at window resetAt starts new window", () => {
    let state;

    const r1 = limiter.process(state, baseTime);
    state = r1.state;

    const resetAt = r1.output.resetAt;

    const r2 = limiter.process(state, resetAt);

    expect(r2.output.allowed).toBe(true);
    expect(r2.state.count).toBe(1);
    expect(r2.state.windowStart).toBe(
      resetAt - (resetAt % (config.window * 1000)),
    );
  });

  test("last millisecond of window still belongs to current window", () => {
    let state: FixedWindowState | undefined;

    for (let i = 0; i < config.limit; i++) {
      const r = limiter.process(state, baseTime);
      state = r.state;
    }

    const lastMs = state!.windowStart + config.window * 1000 - 1;

    const r = limiter.process(state, lastMs);

    expect(r.output.allowed).toBe(false);
  });
});
