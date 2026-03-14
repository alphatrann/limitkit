import { BadArgumentsException, LeakyBucketConfig } from "@limitkit/core";
import { InMemoryLeakyBucket } from "../src";

describe("InMemoryLeakyBucket", () => {
  const config: LeakyBucketConfig = {
    name: "leaky-bucket",
    capacity: 5,
    leakRate: 1,
  };
  let limiter: InMemoryLeakyBucket;
  const base = 1000000;

  beforeEach(() => {
    limiter = new InMemoryLeakyBucket(config);
  });

  test("accepts until full", () => {
    let state;

    for (let i = 0; i < 5; i++) {
      const r = limiter.process(state, base);
      state = r.state;
      expect(r.output.allowed).toBe(true);
    }
  });

  test("rejects overflow", () => {
    let state;

    for (let i = 0; i < 5; i++) {
      const r = limiter.process(state, base);
      state = r.state;
    }

    const r = limiter.process(state, base);
    expect(r.output.allowed).toBe(false);
  });

  test("leak reduces queue size", () => {
    let state;

    const r1 = limiter.process(state, base, 5);
    state = r1.state;

    const r2 = limiter.process(state, base + 3000);

    expect(r2.output.allowed).toBe(true);
  });

  test("reset equals time until queue empty", () => {
    const r = limiter.process(undefined, base, 2);

    expect(r.output.reset).toBeGreaterThan(base);
  });

  test("large time jump empties queue", () => {
    let state;

    const r1 = limiter.process(state, base, 5);
    state = r1.state;

    const r2 = limiter.process(state, base + 60000);

    expect(r2.output.remaining).toBe(4);
  });

  test("cost exceeding capacity throws", () => {
    expect(() => limiter.process(undefined, base, 10)).toThrow(
      BadArgumentsException,
    );
  });
});
