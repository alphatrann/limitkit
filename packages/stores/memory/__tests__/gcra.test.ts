import { GCRAConfig } from "@limitkit/core";
import { InMemoryGCRA } from "../src";

describe("InMemoryGCRA", () => {
  const config: GCRAConfig = { name: "gcra", burst: 3, interval: 1 };
  let limiter: InMemoryGCRA;
  const base = 1000000;

  beforeEach(() => {
    limiter = new InMemoryGCRA(config);
  });

  test("allows burst", () => {
    let state;

    for (let i = 0; i < 3; i++) {
      const r = limiter.process(state, base, 1);
      state = r.state;
      expect(r.output.allowed).toBe(true);
    }
  });

  test("rejects beyond burst", () => {
    let state;

    for (let i = 0; i < 3; i++) {
      const r = limiter.process(state, base, 1);
      state = r.state;
    }

    const r = limiter.process(state, base, 1);

    expect(r.output.allowed).toBe(false);
  });

  test("allows after interval", () => {
    let state;

    for (let i = 0; i < 3; i++) {
      const r = limiter.process(state, base, 1);
      state = r.state;
    }

    const r = limiter.process(state, base + 1000, 1);
    expect(r.output.allowed).toBe(true);
  });

  test("reset equals TAT", () => {
    const r = limiter.process(undefined, base, 1);

    expect(r.output.reset).toBeGreaterThan(base);
  });

  test("remaining computed correctly", () => {
    const r = limiter.process(undefined, base, 1);

    expect(r.output.remaining).toBe(2);
  });

  test("large time jump resets schedule", () => {
    let state;

    const r1 = limiter.process(state, base, 1);
    state = r1.state;

    const r2 = limiter.process(state, base + 60000, 1);

    expect(r2.output.allowed).toBe(true);
  });

  test("cost exceeding burst throws", () => {
    expect(() => limiter.process(undefined, base, 10)).toThrow();
  });
});
