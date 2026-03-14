import { GCRA, GCRAConfig } from "../src";

class MockGCRA extends GCRA {}

describe("GCRA.validate", () => {
  const validConfig: GCRAConfig = {
    name: "gcra",
    interval: 1,
    burst: 10,
  };

  it("does not throw for valid config", () => {
    const algo = new MockGCRA(validConfig);
    expect(() => algo.validate()).not.toThrow();
  });

  it("throws if interval <= 0", () => {
    const algo = new MockGCRA({
      ...validConfig,
      interval: 0,
    });

    expect(() => algo.validate()).toThrow("Expected interval to be positive");
  });

  it("throws if burst <= 0", () => {
    const algo = new MockGCRA({
      ...validConfig,
      burst: -3,
    });

    expect(() => algo.validate()).toThrow("Expected burst to be positive");
  });
});
