import {
  Algorithm,
  BadArgumentsException,
  FixedWindowConfig,
  FixedWindowState,
} from "@limitkit/core";
import { fixedWindow } from "../src";

describe("fixedWindow", () => {
  const config: FixedWindowConfig = {
    name: Algorithm.FixedWindow,
    window: 10,
    limit: 10,
  };

  let state: FixedWindowState;
  let now: number;

  beforeEach(() => {
    now = 1000;
    state = {
      count: 0,
      windowStart: 0,
    };
  });

  test("allows request inside window", () => {
    state.windowStart = 0;

    const result = fixedWindow(state, config, now, 1);
    const updatedState = result.state as FixedWindowState;

    expect(result.output.allowed).toBe(true);
    expect(updatedState.count).toBe(1);
    expect(result.output.remaining).toBe(9);
  });

  test("allows requests until limit", () => {
    state.windowStart = 0;
    state.count = 9;

    const result = fixedWindow(state, config, now, 1);
    const updatedState = result.state as FixedWindowState;

    expect(result.output.allowed).toBe(true);
    expect(updatedState.count).toBe(10);
    expect(result.output.remaining).toBe(0);
  });

  test("blocks request when exceeding limit", () => {
    state.windowStart = 0;
    state.count = 10;

    const result = fixedWindow(state, config, now, 1);

    expect(result.output.allowed).toBe(false);
    expect(result.output.remaining).toBe(0);
    expect(result.output.retryAfter).toBeDefined();
  });

  test("blocks when cost exceeds remaining quota", () => {
    state.windowStart = 0;
    state.count = 8;

    const result = fixedWindow(state, config, now, 3);

    expect(result.output.allowed).toBe(false);
    expect(result.output.remaining).toBe(0);
  });

  test("resets window after expiration", () => {
    const windowMs = config.window * 1000;

    state.windowStart = now - windowMs - 1;
    state.count = 10;

    const result = fixedWindow(state, config, now, 1);
    const updatedState = result.state as FixedWindowState;

    expect(result.output.allowed).toBe(true);
    expect(updatedState.count).toBe(1);
    expect(result.output.remaining).toBe(9);
  });

  test("calculates retryAfter correctly", () => {
    const windowMs = config.window * 1000;

    state.windowStart = now - 1000;
    state.count = 10;

    const result = fixedWindow(state, config, now, 1);

    const expectedReset = state.windowStart + windowMs;
    const expectedRetryAfter = Math.floor((expectedReset - now) / 1000);

    expect(result.output.retryAfter).toBe(expectedRetryAfter);
  });

  test("throws if cost exceeds limit", () => {
    state.windowStart = 0;

    expect(() => fixedWindow(state, config, now, 20)).toThrow(
      BadArgumentsException,
    );
  });

  test("supports multi-cost requests", () => {
    state.windowStart = 0;

    const result = fixedWindow(state, config, now, 5);
    const updatedState = result.state as FixedWindowState;

    expect(result.output.allowed).toBe(true);
    expect(updatedState.count).toBe(5);
    expect(result.output.remaining).toBe(5);
  });
});
