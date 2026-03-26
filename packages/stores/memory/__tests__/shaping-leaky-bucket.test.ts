import { BadArgumentsException, LeakyBucketConfig } from "@limitkit/core";
import { InMemoryShapingLeakyBucket } from "../src";

describe("InMemoryShapingLeakyBucket (deterministic)", () => {
  const config: LeakyBucketConfig = {
    name: "leaky-bucket",
    capacity: 5,
    leakRate: 1, // tokens per second
  };

  let limiter: InMemoryShapingLeakyBucket;
  const base = 1_000_000; // reference timestamp in ms

  beforeEach(() => {
    limiter = new InMemoryShapingLeakyBucket(config);
  });

  test("initial empty bucket allows burst up to capacity", () => {
    let state;

    for (let i = 0; i < config.capacity; i++) {
      const r = limiter.process(state, base);
      state = r.state;

      const expectedAvailableAt = base + ((i + 1) * 1000) / config.leakRate;
      const expectedRemaining = config.capacity - (i + 1);

      expect(r.output.allowed).toBe(true);
      expect(r.output.remaining).toBe(expectedRemaining);
      expect(r.output.availableAt).toBe(expectedAvailableAt);
    }
  });

  test("rejects when adding beyond capacity", () => {
    let state;

    // Fill bucket to capacity
    for (let i = 0; i < config.capacity; i++) {
      const r = limiter.process(state, base);
      state = r.state;
    }

    // Next request should be rejected
    const queueSize = config.capacity; // full bucket
    const expectedNextFreeAt = base + (queueSize / config.leakRate) * 1000;
    const expectedResetAt = base + (queueSize / config.leakRate) * 1000;

    const r = limiter.process(state, base);
    expect(r.output.allowed).toBe(false);
    expect(r.output.availableAt).toBe(expectedNextFreeAt);
    expect(r.output.resetAt).toBe(expectedResetAt);
    expect(r.output.remaining).toBe(0);
  });

  test("accepts after time has passed", () => {
    let state;

    // Fill bucket to capacity
    for (let i = 0; i < config.capacity; i++) {
      const r = limiter.process(state, base);
      state = r.state;
    }

    // Move time forward 2 seconds
    const elapsed = 2_000;
    const r = limiter.process(state, base + elapsed);

    const leakedTokens = (elapsed / 1000) * config.leakRate;
    const expectedQueueSize = Math.max(0, config.capacity - leakedTokens);
    const expectedRemaining =
      Math.floor(config.capacity - expectedQueueSize) - 1;
    const expectedAvailableAt =
      Math.max(base + elapsed, state!.nextFreeAt) +
      (1 / config.leakRate) * 1000;
    const expectedResetAt =
      base + elapsed + ((expectedQueueSize + 1) / config.leakRate) * 1000;

    expect(r.output.allowed).toBe(true);
    expect(r.output.remaining).toBe(expectedRemaining);
    expect(r.output.availableAt).toBe(expectedAvailableAt);
    expect(r.output.resetAt).toBe(expectedResetAt);
  });

  test("multiple costs schedule correctly", () => {
    let state;

    const r1 = limiter.process(undefined, base, 2);
    state = r1.state;

    const expectedAvailableAt1 = base + (2 / config.leakRate) * 1000;
    expect(r1.output.availableAt).toBe(expectedAvailableAt1);
    expect(r1.output.remaining).toBe(3);

    const r2 = limiter.process(state, base, 2);
    state = r2.state;

    const expectedAvailableAt2 =
      expectedAvailableAt1 + (2 / config.leakRate) * 1000;
    expect(r2.output.availableAt).toBe(expectedAvailableAt2);
    expect(r2.output.remaining).toBe(1);
  });

  test("large time jump empties bucket", () => {
    let state;

    const r1 = limiter.process(undefined, base, 3);
    state = r1.state;

    const timeJump = 10_000; // 10 seconds later
    const r2 = limiter.process(state, base + timeJump);

    // all previous tokens should have leaked
    const leakedTokens = (timeJump / 1000) * config.leakRate;
    const expectedQueueSize = Math.max(0, 3 - leakedTokens);
    const expectedRemaining =
      Math.floor(config.capacity - expectedQueueSize) - 1;
    const expectedAvailableAt =
      Math.max(state.nextFreeAt, base + timeJump) +
      (1 / config.leakRate) * 1000;
    const expectedResetAt =
      base + timeJump + ((expectedQueueSize + 1) / config.leakRate) * 1000;

    expect(r2.output.allowed).toBe(true);
    expect(r2.output.remaining).toBe(expectedRemaining);
    expect(r2.output.availableAt).toBe(expectedAvailableAt);
    expect(r2.output.resetAt).toBe(expectedResetAt);
  });

  test("cost > capacity throws", () => {
    expect(() => limiter.process(undefined, base, config.capacity + 1)).toThrow(
      BadArgumentsException,
    );
  });
});
