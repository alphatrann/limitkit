import {
  Algorithm,
  BadArgumentsException,
  FixedWindowConfig,
} from "@limitkit/core";
import { fixedWindow, FixedWindowState } from "../src";

describe("fixedWindow", () => {
  const config: FixedWindowConfig = {
    name: Algorithm.FixedWindow,
    window: 10,
    limit: 10,
  };

  const LIMIT = config.limit;
  const W = config.window * 1000;

  let state: FixedWindowState;
  let now: number;

  beforeEach(() => {
    now = 1000;
    state = {
      count: 0,
      windowStart: 0,
    };
  });

  test("accept condition: count + cost ≤ limit", () => {
    state.count = 8;

    const cost = 2;

    const res = fixedWindow(state, config, now, cost);
    const s = res.state as FixedWindowState;

    expect(state.count + cost).toBeLessThanOrEqual(LIMIT);
    expect(res.output.allowed).toBe(true);
    expect(s.count).toBe(10);
  });

  test("deny condition: count + cost > limit", () => {
    state.count = 9;

    const cost = 2;

    const res = fixedWindow(state, config, now, cost);

    expect(state.count + cost).toBeGreaterThan(LIMIT);
    expect(res.output.allowed).toBe(false);
    expect(res.output.remaining).toBe(0);
  });

  test("remaining = limit - (count + cost)", () => {
    state.count = 3;

    const cost = 2;

    const res = fixedWindow(state, config, now, cost);

    const expectedRemaining = LIMIT - (3 + cost);

    expect(res.output.remaining).toBe(expectedRemaining);
  });

  test("window expiration: elapsed ≥ window resets counter", () => {
    state.count = 10;
    state.windowStart = now - W - 1;

    const res = fixedWindow(state, config, now, 1);
    const s = res.state as FixedWindowState;

    expect(now - state.windowStart).toBeGreaterThanOrEqual(W);
    expect(res.output.allowed).toBe(true);
    expect(s.count).toBe(1);
  });

  test("window active: elapsed < window preserves count", () => {
    state.count = 4;
    state.windowStart = now - 2000;

    const res = fixedWindow(state, config, now, 1);
    const s = res.state as FixedWindowState;

    expect(now - state.windowStart).toBeLessThan(W);
    expect(s.count).toBe(5);
  });

  test("retryAfter = ceil((windowStart + W - now)/1000)", () => {
    state.count = LIMIT;
    state.windowStart = now - 1000;

    const res = fixedWindow(state, config, now, 1);

    const reset = state.windowStart + W;
    const expectedRetry = Math.ceil((reset - now) / 1000);

    expect(res.output.retryAfter).toBe(expectedRetry);
  });

  test("reset = windowStart + window", () => {
    state.count = 3;

    const res = fixedWindow(state, config, now, 1);

    const expectedReset = state.windowStart + W;

    expect(res.output.reset).toBe(expectedReset);
  });

  test("multi-cost request updates count exactly", () => {
    const cost = 5;

    const res = fixedWindow(state, config, now, cost);
    const s = res.state as FixedWindowState;

    const expectedCount = cost;

    expect(s.count).toBe(expectedCount);
    expect(res.output.remaining).toBe(LIMIT - expectedCount);
  });

  test("capacity invariant: 0 ≤ count ≤ limit", () => {
    state.count = 7;

    const res = fixedWindow(state, config, now, 2);
    const s = res.state as FixedWindowState;

    expect(s.count).toBeGreaterThanOrEqual(0);
    expect(s.count).toBeLessThanOrEqual(LIMIT);
  });

  test("exact boundary: request at window expiration resets", () => {
    state.count = LIMIT;
    state.windowStart = now - W;

    const res = fixedWindow(state, config, now, 1);
    const s = res.state as FixedWindowState;

    expect(now - state.windowStart).toBe(W);
    expect(res.output.allowed).toBe(true);
    expect(s.count).toBe(1);
  });

  test("reject if cost > limit (invalid request)", () => {
    expect(() => fixedWindow(state, config, now, LIMIT + 1)).toThrow(
      BadArgumentsException,
    );
  });
});
