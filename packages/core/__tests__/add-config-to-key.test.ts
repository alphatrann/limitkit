import { addConfigToKey } from "../src/utils/add-config-to-key";
import { Algorithm, AlgorithmConfig } from "../src/types";

describe("addConfigToKey", () => {
  describe("basic functionality", () => {
    it("should create a modified key with algorithm name, hash, and original key", () => {
      const config: AlgorithmConfig = {
        name: Algorithm.FixedWindow,
        window: 60,
        limit: 100,
      };
      const key = "user-123";

      const result = addConfigToKey(config, key);

      expect(result).toMatch(/^ratelimit:fixed-window:[a-f0-9]{64}:user-123$/);
    });

    it("should include the algorithm name in the modified key", () => {
      const config: AlgorithmConfig = {
        name: Algorithm.TokenBucket,
        capacity: 100,
        refillRate: 10,
      };
      const key = "api-key";

      const result = addConfigToKey(config, key);

      expect(result).toContain("token-bucket");
    });

    it("should include the original key at the end", () => {
      const config: AlgorithmConfig = {
        name: Algorithm.FixedWindow,
        window: 60,
        limit: 100,
      };
      const key = "original-key";

      const result = addConfigToKey(config, key);

      expect(result).toMatch(/:original-key$/);
    });

    it("should produce a 64-character hex hash (SHA-256)", () => {
      const config: AlgorithmConfig = {
        name: Algorithm.SlidingWindow,
        window: 120,
        limit: 500,
      };
      const key = "test-key";

      const result = addConfigToKey(config, key);
      const hashPart = result.split(":")[2];

      expect(hashPart).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe("config property ordering", () => {
    it("should produce same hash regardless of property order", () => {
      const config1: AlgorithmConfig = {
        name: Algorithm.FixedWindow,
        window: 60,
        limit: 100,
      };
      const config2: AlgorithmConfig = {
        limit: 100,
        name: Algorithm.FixedWindow,
        window: 60,
      };
      const key = "test-key";

      const result1 = addConfigToKey(config1, key);
      const result2 = addConfigToKey(config2, key);

      expect(result1).toBe(result2);
    });

    it("should produce same hash when properties are added in different order", () => {
      const key = "test-key";
      const config1: AlgorithmConfig = {
        name: Algorithm.TokenBucket,
        capacity: 100,
        refillRate: 10,
      };
      const config2: AlgorithmConfig = {
        refillRate: 10,
        capacity: 100,
        name: Algorithm.TokenBucket,
      };

      const result1 = addConfigToKey(config1, key);
      const result2 = addConfigToKey(config2, key);

      expect(result1).toBe(result2);
    });
  });

  describe("uniqueness for different configs", () => {
    it("should produce different hashes for different config values", () => {
      const config1: AlgorithmConfig = {
        name: Algorithm.FixedWindow,
        window: 60,
        limit: 100,
      };
      const config2: AlgorithmConfig = {
        name: Algorithm.FixedWindow,
        window: 60,
        limit: 200,
      };
      const key = "same-key";

      const result1 = addConfigToKey(config1, key);
      const result2 = addConfigToKey(config2, key);

      expect(result1).not.toBe(result2);
    });

    it("should produce different hashes for different algorithms", () => {
      const config1: AlgorithmConfig = {
        name: Algorithm.FixedWindow,
        window: 60,
        limit: 100,
      };
      const config2: AlgorithmConfig = {
        name: Algorithm.SlidingWindow,
        window: 60,
        limit: 100,
      };
      const key = "test-key";

      const result1 = addConfigToKey(config1, key);
      const result2 = addConfigToKey(config2, key);

      expect(result1).not.toBe(result2);
    });

    it("should produce different hashes for different window/capacity values", () => {
      const config1: AlgorithmConfig = {
        name: Algorithm.FixedWindow,
        window: 60,
        limit: 100,
      };
      const config2: AlgorithmConfig = {
        name: Algorithm.FixedWindow,
        window: 120,
        limit: 100,
      };
      const key = "test-key";

      const result1 = addConfigToKey(config1, key);
      const result2 = addConfigToKey(config2, key);

      expect(result1).not.toBe(result2);
    });
  });

  describe("uniqueness for different keys", () => {
    it("should produce different modified keys for different original keys", () => {
      const config: AlgorithmConfig = {
        name: Algorithm.FixedWindow,
        window: 60,
        limit: 100,
      };

      const result1 = addConfigToKey(config, "key1");
      const result2 = addConfigToKey(config, "key2");

      expect(result1).not.toBe(result2);
      expect(result1).toContain(":key1");
      expect(result2).toContain(":key2");
    });

    it("should preserve original key even with special characters", () => {
      const config: AlgorithmConfig = {
        name: Algorithm.FixedWindow,
        window: 60,
        limit: 100,
      };
      const key = "user:123:admin";

      const result = addConfigToKey(config, key);

      expect(result).toMatch(/:user:123:admin$/);
    });
  });

  describe("algorithm-specific configs", () => {
    it("should handle FixedWindow config correctly", () => {
      const config: AlgorithmConfig = {
        name: Algorithm.FixedWindow,
        window: 60,
        limit: 100,
      };

      const result = addConfigToKey(config, "key");

      expect(result).toContain("fixed-window");
      expect(result).toMatch(/^ratelimit:fixed-window:[a-f0-9]{64}:key$/);
    });

    it("should handle TokenBucket config correctly", () => {
      const config: AlgorithmConfig = {
        name: Algorithm.TokenBucket,
        capacity: 100,
        refillRate: 10,
      };

      const result = addConfigToKey(config, "key");

      expect(result).toContain("token-bucket");
      expect(result).toMatch(/^ratelimit:token-bucket:[a-f0-9]{64}:key$/);
    });

    it("should handle LeakyBucket config correctly", () => {
      const config: AlgorithmConfig = {
        name: Algorithm.LeakyBucket,
        capacity: 100,
        leakRate: 10,
      };

      const result = addConfigToKey(config, "key");

      expect(result).toContain("leaky-bucket");
      expect(result).toMatch(/^ratelimit:leaky-bucket:[a-f0-9]{64}:key$/);
    });

    it("should handle SlidingWindow config correctly", () => {
      const config: AlgorithmConfig = {
        name: Algorithm.SlidingWindow,
        window: 60,
        limit: 100,
      };

      const result = addConfigToKey(config, "key");

      expect(result).toContain("sliding-window");
      expect(result).toMatch(/^ratelimit:sliding-window:[a-f0-9]{64}:key$/);
    });

    it("should handle SlidingWindowCounter config correctly", () => {
      const config: AlgorithmConfig = {
        name: Algorithm.SlidingWindowCounter,
        window: 60,
        limit: 100,
      };

      const result = addConfigToKey(config, "key");

      expect(result).toContain("sliding-window-counter");
      expect(result).toMatch(
        /^ratelimit:sliding-window-counter:[a-f0-9]{64}:key$/,
      );
    });

    it("should handle GCRA config correctly", () => {
      const config: AlgorithmConfig = {
        name: Algorithm.GCRA,
        burst: 100,
        interval: 60,
      };

      const result = addConfigToKey(config, "key");

      expect(result).toContain("gcra");
      expect(result).toMatch(/^ratelimit:gcra:[a-f0-9]{64}:key$/);
    });
  });

  describe("consistency", () => {
    it("should always produce the same result for same inputs", () => {
      const config: AlgorithmConfig = {
        name: Algorithm.FixedWindow,
        window: 60,
        limit: 100,
      };
      const key = "consistent-key";

      const result1 = addConfigToKey(config, key);
      const result2 = addConfigToKey(config, key);
      const result3 = addConfigToKey(config, key);

      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
    });
  });

  describe("edge cases", () => {
    it("should handle keys with colons", () => {
      const config: AlgorithmConfig = {
        name: Algorithm.FixedWindow,
        window: 60,
        limit: 100,
      };
      const key = "namespace:resource:id";

      const result = addConfigToKey(config, key);

      expect(result).toMatch(/:namespace:resource:id$/);
    });

    it("should handle empty string key", () => {
      const config: AlgorithmConfig = {
        name: Algorithm.FixedWindow,
        window: 60,
        limit: 100,
      };
      const key = "";

      const result = addConfigToKey(config, key);

      expect(result).toMatch(/^ratelimit:fixed-window:[a-f0-9]{64}:$/);
    });

    it("should handle numeric values in config", () => {
      const config: AlgorithmConfig = {
        name: Algorithm.FixedWindow,
        window: 3600,
        limit: 10000,
      };

      const result = addConfigToKey(config, "key");

      expect(result).toMatch(/^ratelimit:fixed-window:[a-f0-9]{64}:key$/);
    });
  });
});
