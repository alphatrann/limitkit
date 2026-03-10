import { Algorithm, LeakyBucketConfig } from "@limitkit/core";
import { leakyBucket } from "../src";

type LeakyBucketState = {
  queueSize: number;
  lastLeak: number | null;
};

const config: LeakyBucketConfig = {
  name: Algorithm.LeakyBucket,
  capacity: 10,
  leakRate: 2,
};

function createState(): LeakyBucketState {
  return {
    queueSize: 0,
    lastLeak: null,
  };
}

describe("leakyBucket", () => {
  test("initial request should be allowed", () => {
    const state = createState();

    const res = leakyBucket(state, config, 1000, 1);

    expect(res.output.allowed).toBe(true);
    expect((res.state as LeakyBucketState).queueSize).toBe(1);
  });

  test("queue grows with accepted requests", () => {
    let state = createState();

    for (let i = 0; i < 5; i++) {
      const res = leakyBucket(state, config, 1000, 1);
      state = res.state as LeakyBucketState;
    }

    expect(state.queueSize).toBe(5);
  });

  test("reject when capacity exceeded", () => {
    let state = createState();

    state = leakyBucket(state, config, 1000, 10).state as LeakyBucketState;

    const res = leakyBucket(state, config, 1000, 1);

    expect(res.output.allowed).toBe(false);
    expect(res.output.retryAfter).toBeGreaterThan(0);
  });

  test("queue leaks over time", () => {
    let state = createState();

    state = leakyBucket(state, config, 1000, 10).state as LeakyBucketState;

    const res = leakyBucket(state, config, 2000, 1);

    expect(res.output.allowed).toBe(true);
  });

  test("partial leak should reduce queue size", () => {
    let state = createState();

    state = leakyBucket(state, config, 1000, 4).state as LeakyBucketState;

    const res = leakyBucket(state, config, 1500, 0);

    expect((res.state as LeakyBucketState).queueSize).toBeLessThan(4);
  });

  test("large time jump empties the queue", () => {
    let state = createState();

    state = leakyBucket(state, config, 1000, 5).state as LeakyBucketState;

    const res = leakyBucket(state, config, 10000, 1);

    expect(res.output.allowed).toBe(true);
    expect((res.state as LeakyBucketState).queueSize).toBeLessThanOrEqual(1);
  });

  test("cost larger than available capacity should reject", () => {
    let state = createState();

    state = leakyBucket(state, config, 1000, 9).state as LeakyBucketState;

    const res = leakyBucket(state, config, 1000, 5);

    expect(res.output.allowed).toBe(false);
  });

  test("retryAfter indicates time needed for space", () => {
    let state = createState();

    state = leakyBucket(state, config, 1000, 10).state as LeakyBucketState;

    const res = leakyBucket(state, config, 1000, 1);

    expect(res.output.retryAfter).toBeGreaterThan(0);
  });

  test("reset indicates when queue fully drains", () => {
    let state = createState();

    state = leakyBucket(state, config, 1000, 5).state as LeakyBucketState;

    const res = leakyBucket(state, config, 1000, 1);

    expect(res.output.reset).toBeGreaterThan(1000);
  });

  test("remaining capacity reported correctly", () => {
    let state = createState();

    const res = leakyBucket(state, config, 1000, 3);

    expect(res.output.remaining).toBe(7);
  });

  test("queue size never exceeds capacity after accept", () => {
    let state = createState();

    const res = leakyBucket(state, config, 1000, 10);

    expect((res.state as LeakyBucketState).queueSize).toBeLessThanOrEqual(
      config.capacity,
    );
  });

  test("queue size never becomes negative after leak", () => {
    let state = createState();

    state = leakyBucket(state, config, 1000, 2).state as LeakyBucketState;

    const res = leakyBucket(state, config, 10000, 0);

    expect((res.state as LeakyBucketState).queueSize).toBeGreaterThanOrEqual(0);
  });
});
