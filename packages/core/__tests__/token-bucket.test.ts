import { TokenBucket, TokenBucketConfig } from "../src";

class MockTokenBucket extends TokenBucket {}

describe("TokenBucket.validate", () => {
  const validConfig: TokenBucketConfig = {
    name: "token-bucket",
    refillRate: 10,
    capacity: 100,
  };

  it("does not throw for valid config", () => {
    const algo = new MockTokenBucket(validConfig);
    expect(() => algo.validate()).not.toThrow();
  });

  it("throws if refillRate <= 0", () => {
    const algo = new MockTokenBucket({
      ...validConfig,
      refillRate: -2,
    });

    expect(() => algo.validate()).toThrow("Expected refillRate to be positive");
  });

  it("throws if capacity <= 0", () => {
    const algo = new MockTokenBucket({
      ...validConfig,
      capacity: 0,
    });

    expect(() => algo.validate()).toThrow("Expected capacity to be positive");
  });
});
