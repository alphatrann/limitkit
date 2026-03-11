import { Algorithm, SlidingWindowConfig } from "@limitkit/core";
import { slidingWindow } from "../src";

describe("slidingWindow", () => {
  const limit = 5;
  const window = 10;
  const W = window * 1000;

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

  it("remaining = limit - used", () => {
    const state = createState();
    const now = 1000;

    const res = slidingWindow(state, config, now, 1);

    const used = 1;
    const expectedRemaining = limit - used;

    expect(res.output.remaining).toBe(expectedRemaining);
  });

  it("reset = newestTimestamp + window", () => {
    const state = createState();

    slidingWindow(state, config, 1000, 1);
    const res = slidingWindow(state, config, 2000, 1);

    const newest = 2000;
    const expectedReset = newest + W;

    expect(res.output.reset).toBe(expectedReset);
  });

  it("active requests satisfy: now - t < window", () => {
    const state = createState();

    slidingWindow(state, config, 0, 1);
    slidingWindow(state, config, 2000, 1);
    slidingWindow(state, config, 4000, 1);

    const now = 15000;

    const res = slidingWindow(state, config, now, 1);

    const active = state.size;

    // All earlier timestamps expired since
    // 15000 - 4000 = 11000 > W
    expect(active).toBe(1);
    expect(res.output.remaining).toBe(limit - active);
  });

  it("denial occurs when used + cost > limit", () => {
    const state = createState();

    slidingWindow(state, config, 1000, 4);

    const res = slidingWindow(state, config, 2000, 2);

    const used = 4;
    const cost = 2;

    expect(used + cost).toBeGreaterThan(limit);
    expect(res.output.allowed).toBe(false);
  });

  it("retryAfter = oldest + window - now", () => {
    const state = createState();

    slidingWindow(state, config, 0, 5);

    const now = 1000;
    const res = slidingWindow(state, config, now, 1);

    const oldest = 0;
    const expectedRetryAfter = Math.ceil((oldest + W - now) / 1000);

    expect(res.output.retryAfter).toBe(expectedRetryAfter);
  });

  it("expiration condition: timestamp removed when now - t >= window", () => {
    const state = createState();

    slidingWindow(state, config, 0, 1);

    const boundary = W;

    const res = slidingWindow(state, config, boundary, 1);

    //  boundary - 0 = W → expired
    expect(res.output.allowed).toBe(true);
    expect(state.size).toBe(1);
  });

  it("cost consumes exact slots", () => {
    const state = createState();

    const cost = 3;
    const res = slidingWindow(state, config, 1000, cost);

    const used = cost;

    expect(state.size).toBe(used);
    expect(res.output.remaining).toBe(limit - used);
  });

  it("capacity invariant: 0 ≤ size ≤ limit", () => {
    const state = createState();

    for (let i = 0; i < 20; i++) {
      slidingWindow(state, config, i * 1000, 1);
    }

    expect(state.size).toBeGreaterThanOrEqual(0);
    expect(state.size).toBeLessThanOrEqual(limit);
  });
});
