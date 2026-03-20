import { BadArgumentsException } from "@limitkit/core";
import { InMemoryTokenBucket, tokenBucket } from "../src";

describe("InMemoryTokenBucket", () => {
  const config = {
    capacity: 5,
    refillRate: 1,
  };
  let limiter: InMemoryTokenBucket;
  const base = 1000000;

  beforeEach(() => {
    limiter = tokenBucket(config);
  });

  test("initial capacity allows burst", () => {
    let state;

    for (let i = 0; i < config.capacity; i++) {
      const r = limiter.process(state, base);
      state = r.state;
      expect(r.output.remaining).toBe(config.capacity - i - 1);
      expect(r.output.allowed).toBe(true);
    }
  });

  test("rejects when empty", () => {
    let state;

    for (let i = 0; i < config.capacity; i++) {
      const r = limiter.process(state, base);
      state = r.state;
    }

    const r = limiter.process(state, base);
    expect(r.output.allowed).toBe(false);
    expect(r.output.resetAt).toBe(
      base + Math.ceil((config.capacity / config.refillRate) * 1000),
    );
    expect(r.output.retryAt).toBe(base + Math.ceil(1000 / config.refillRate));
  });

  test("refill works over time", () => {
    let state;

    for (let i = 0; i < 5; i++) {
      const r = limiter.process(state, base);
      state = r.state;
    }

    const r = limiter.process(state, base + 5000);
    expect(r.output.allowed).toBe(true);
  });

  test("remaining tokens computed correctly", () => {
    const r = limiter.process(undefined, base, 2);
    expect(r.output.remaining).toBe(3);
    expect(r.state.tokens).toBe(r.output.remaining);
  });

  test("large time jump refills bucket", () => {
    let state;

    const r1 = limiter.process(state, base);
    state = r1.state;

    const r2 = limiter.process(state, base + 3600000);
    expect(r2.output.remaining).toBe(config.capacity - 1);
    expect(r2.state.tokens).toBe(r2.output.remaining);
  });

  test("cost > capacity throws", () => {
    expect(() => limiter.process(undefined, base, 10)).toThrow(
      BadArgumentsException,
    );
  });
});
