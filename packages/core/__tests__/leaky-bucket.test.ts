import { LeakyBucket, LeakyBucketConfig } from "../src";

class MockLeakyBucket extends LeakyBucket {}

describe("LeakyBucket.validate", () => {
  const validConfig: LeakyBucketConfig = {
    name: "leaky-bucket",
    leakRate: 5,
    capacity: 50,
  };

  it("does not throw for valid config", () => {
    const algo = new MockLeakyBucket(validConfig);
    expect(() => algo.validate()).not.toThrow();
  });

  it("throws if leakRate <= 0", () => {
    const algo = new MockLeakyBucket({
      ...validConfig,
      leakRate: -3,
    });

    expect(() => algo.validate()).toThrow("Expected leakRate to be positive");
  });

  it("throws if capacity <= 0", () => {
    const algo = new MockLeakyBucket({
      ...validConfig,
      capacity: -4,
    });

    expect(() => algo.validate()).toThrow("Expected capacity to be positive");
  });
});
