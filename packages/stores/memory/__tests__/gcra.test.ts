import { Algorithm, GCRAConfig } from "@limitkit/core";
import { gcra, GCRAState } from "../src";

const config: GCRAConfig = {
  name: Algorithm.GCRA,
  interval: 1,
  burst: 3,
};

function createState(): GCRAState {
  return {
    tat: null,
  };
}

describe("gcra", () => {
  test("first request is allowed", () => {
    const state = createState();

    const res = gcra(state, config, 1000, 1);

    expect(res.output.allowed).toBe(true);
    expect((res.state as GCRAState).tat).toBeGreaterThanOrEqual(1000);
  });

  test("requests within burst are allowed", () => {
    let state = createState();

    const t = 1000;

    for (let i = 0; i < 3; i++) {
      const res = gcra(state, config, t, 1);
      expect(res.output.allowed).toBe(true);
      state = res.state as GCRAState;
    }
  });

  test("request exceeding burst is rejected", () => {
    let state = createState();

    const t = 100;

    for (let i = 0; i < 4; i++) {
      state = gcra(state, config, t, 1).state as GCRAState;
    }

    const res = gcra(state, config, t, 1);

    expect(res.output.allowed).toBe(false);
    expect(res.output.retryAfter).toBeGreaterThan(0);
  });

  test("request allowed after interval spacing", () => {
    let state = createState();

    state = gcra(state, config, 1000, 1).state as GCRAState;

    const res = gcra(state, config, 2000, 1);

    expect(res.output.allowed).toBe(true);
  });

  test("multi-cost request advances TAT correctly", () => {
    let state = createState();

    const res = gcra(state, config, 1000, 2);

    expect(res.output.allowed).toBe(true);
    expect((res.state as GCRAState).tat).toBeGreaterThan(2000);
  });

  test("multi-cost exceeding burst should reject", () => {
    let state = createState();
    state = gcra(state, config, 100, 3).state as GCRAState;
    const res2 = gcra(state, config, 200, 2);

    expect(res2.output.allowed).toBe(false);
  });

  test("retryAfter decreases as time progresses", () => {
    let state = createState();

    const t = 1000;

    for (let i = 0; i < 3; i++) {
      state = gcra(state, config, t, 1).state as GCRAState;
    }

    const res1 = gcra(state, config, t, 1);
    const res2 = gcra(state, config, t + 500, 1);

    expect(res2.output.retryAfter).toBeLessThanOrEqual(res1.output.retryAfter!);
  });

  test("reset time indicates when burst debt clears", () => {
    let state = createState();

    const t = 1000;

    for (let i = 0; i < 2; i++) {
      state = gcra(state, config, t, 1).state as GCRAState;
    }

    const res = gcra(state, config, t, 1);

    expect(res.output.reset).toBeGreaterThanOrEqual(t);
  });

  test("large time jump resets burst allowance", () => {
    let state = createState();

    const t = 1000;

    for (let i = 0; i < 3; i++) {
      state = gcra(state, config, t, 1).state as GCRAState;
    }

    const res = gcra(state, config, 10000, 1);

    expect(res.output.allowed).toBe(true);
  });

  test("remaining tokens decrease with burst usage", () => {
    let state = createState();

    const t = 1000;

    const res1 = gcra(state, config, t, 1);
    state = res1.state as GCRAState;

    const res2 = gcra(state, config, t, 1);

    expect(res2.output.remaining).toBeLessThanOrEqual(res1.output.remaining);
  });
});
