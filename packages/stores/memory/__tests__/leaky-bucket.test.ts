import { Algorithm, LeakyBucketConfig } from "@limitkit/core";
import { leakyBucket, LeakyBucketState } from "../src";

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
  const CAP = config.capacity;
  const RATE = config.leakRate;

  test("initial queue size = cost", () => {
    const state = createState();

    const cost = 1;
    const res = leakyBucket(state, config, 1000, cost);

    expect(res.output.allowed).toBe(true);
    expect((res.state as LeakyBucketState).queueSize).toBe(cost);
  });

  test("queue accumulation: queue = Σ cost", () => {
    let state = createState();

    for (let i = 0; i < 5; i++) {
      const res = leakyBucket(state, config, 1000, 1);
      state = res.state as LeakyBucketState;
    }

    const expectedQueue = 5;

    expect(state.queueSize).toBe(expectedQueue);
  });

  test("deny condition: queue + cost > capacity", () => {
    let state = createState();

    state = leakyBucket(state, config, 1000, 10).state as LeakyBucketState;

    const queue = 10;
    const cost = 1;

    const res = leakyBucket(state, config, 1000, cost);

    expect(queue + cost).toBeGreaterThan(CAP);
    expect(res.output.allowed).toBe(false);
  });

  test("leak equation: queue = max(0, prevQueue - rate * dt)", () => {
    let state = createState();

    state = leakyBucket(state, config, 1000, 10).state as LeakyBucketState;

    const now = 2000;
    const dt = now - 1000;

    const leaked = RATE * (dt / 1000);
    const expectedQueueBefore = Math.max(0, 10 - leaked);

    const res = leakyBucket(state, config, now, 1);

    const expectedQueueAfter = expectedQueueBefore + 1;

    expect((res.state as LeakyBucketState).queueSize).toBe(expectedQueueAfter);
  });

  test("large time jump drains queue", () => {
    let state = createState();

    state = leakyBucket(state, config, 1000, 5).state as LeakyBucketState;

    const now = 10000;
    const dt = now - 1000;

    const leaked = RATE * (dt / 1000);
    const expectedQueueBefore = Math.max(0, 5 - leaked);

    const res = leakyBucket(state, config, now, 1);

    expect(expectedQueueBefore).toBe(0);
    expect((res.state as LeakyBucketState).queueSize).toBe(1);
  });

  test("cost larger than remaining capacity rejects", () => {
    let state = createState();

    state = leakyBucket(state, config, 1000, 9).state as LeakyBucketState;

    const queue = 9;
    const cost = 5;

    const res = leakyBucket(state, config, 1000, cost);

    expect(queue + cost).toBeGreaterThan(CAP);
    expect(res.output.allowed).toBe(false);
  });

  test("retryAfter = ceil((queue + cost - capacity)/rate)", () => {
    let state = createState();

    state = leakyBucket(state, config, 1000, 10).state as LeakyBucketState;

    const queue = 10;
    const cost = 1;

    const expectedRetry = Math.ceil((queue + cost - CAP) / RATE);

    const res = leakyBucket(state, config, 1000, cost);

    expect(res.output.retryAfter).toBe(expectedRetry);
  });

  test("reset = time until queue drains", () => {
    let state = createState();

    const res = leakyBucket(state, config, 1000, 5);

    const queue = 5;
    const drainSeconds = queue / RATE;

    const expectedReset = 1000 + drainSeconds * 1000;

    expect(res.output.reset).toBe(expectedReset);
  });

  test("remaining = capacity - queueAfter", () => {
    const state = createState();

    const cost = 3;

    const res = leakyBucket(state, config, 1000, cost);

    const expectedQueue = cost;
    const expectedRemaining = CAP - expectedQueue;

    expect(res.output.remaining).toBe(expectedRemaining);
  });

  test("capacity invariant: 0 ≤ queue ≤ capacity", () => {
    let state = createState();

    for (let i = 0; i < 50; i++) {
      const res = leakyBucket(state, config, 1000 + i * 200, 1);
      state = res.state as LeakyBucketState;
    }

    expect(state.queueSize).toBeGreaterThanOrEqual(0);
    expect(state.queueSize).toBeLessThanOrEqual(CAP);
  });

  test("queue never becomes negative after leak", () => {
    let state = createState();

    state = leakyBucket(state, config, 1000, 2).state as LeakyBucketState;

    const res = leakyBucket(state, config, 10000, 1);

    expect((res.state as LeakyBucketState).queueSize).toBeGreaterThanOrEqual(0);
  });
});
