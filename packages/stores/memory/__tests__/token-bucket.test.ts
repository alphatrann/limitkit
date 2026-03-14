import { BadArgumentsException, TokenBucketConfig } from "@limitkit/core";
import { InMemoryTokenBucket } from "../src";

describe("InMemoryTokenBucket", () => {
  const config: TokenBucketConfig = {
    name: "token-bucket",
    capacity: 5,
    refillRate: 1,
  };
  let limiter: InMemoryTokenBucket;
  const base = 1000000;

  beforeEach(() => {
    limiter = new InMemoryTokenBucket(config);
  });

  test("initial capacity allows burst", () => {
    let state;

    for (let i = 0; i < 5; i++) {
      const r = limiter.process(state, base);
      state = r.state;
      expect(r.output.allowed).toBe(true);
    }
  });

  test("rejects when empty", () => {
    let state;

    for (let i = 0; i < 5; i++) {
      const r = limiter.process(state, base);
      state = r.state;
    }

    const r = limiter.process(state, base);
    expect(r.output.allowed).toBe(false);
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
  });

  test("retryAfter computed correctly", () => {
    let state;

    for (let i = 0; i < 5; i++) {
      const r = limiter.process(state, base);
      state = r.state;
    }

    const r = limiter.process(state, base);
    expect(r.output.retryAfter).toBeGreaterThan(0);
  });

  test("large time jump refills bucket", () => {
    let state;

    const r1 = limiter.process(state, base);
    state = r1.state;

    const r2 = limiter.process(state, base + 3600000);
    expect(r2.output.remaining).toBe(4);
  });

  test("cost > capacity throws", () => {
    expect(() => limiter.process(undefined, base, 10)).toThrow(
      BadArgumentsException,
    );
  });
});
