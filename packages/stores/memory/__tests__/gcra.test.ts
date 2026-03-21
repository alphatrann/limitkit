import { gcra, InMemoryGCRA } from "../src";

describe("InMemoryGCRA", () => {
  const config = { burst: 3, interval: 1 };
  let limiter: InMemoryGCRA;
  const base = 1000000;

  beforeEach(() => {
    limiter = gcra(config);
  });

  test("allows burst", () => {
    let state;

    for (let i = 0; i < config.burst; i++) {
      const now = base + i * 100;
      const prevTat = state?.tat ?? now;

      const r = limiter.process(state, now);

      expect(r.output.allowed).toBe(true);

      const expectedTat = Math.max(now, prevTat) + 1000;

      expect(r.state.tat).toBe(expectedTat);
      expect(r.output.resetAt).toBe(expectedTat);

      state = r.state;
    }
  });

  test("rejects beyond burst", () => {
    let state;

    for (let i = 0; i < config.burst; i++) {
      const r = limiter.process(state, base, 1);
      state = r.state;
    }

    const r = limiter.process(state, base, 1);

    expect(r.output.allowed).toBe(false);
  });

  test("allows after interval", () => {
    let state;

    for (let i = 0; i < config.burst; i++) {
      const r = limiter.process(state, base, 1);
      state = r.state;
    }

    const r = limiter.process(state, base + 1000, 1);
    expect(r.output.allowed).toBe(true);
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
    expect(r2.output.remaining).toBe(config.burst - 1);
    expect(r2.state.tat).toBe(base + 61000);
  });

  test("cost exceeding burst throws", () => {
    expect(() => limiter.process(undefined, base, 10)).toThrow();
  });
});
