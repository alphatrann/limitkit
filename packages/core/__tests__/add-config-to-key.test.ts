import { addConfigToKey } from '../src/utils/add-config-to-key';
import { AlgorithmConfig } from '../src/types';

describe('addConfigToKey', () => {
  describe('basic functionality', () => {
    it('creates a modified key with scope, algorithm name, hash, and original key', () => {
      const config: AlgorithmConfig = {
        name: 'fixed-window',
        window: 60,
        limit: 100,
      };

      const result = addConfigToKey(config, 'user-123', 'per-user');

      expect(result).toMatch(
        /^ratelimit:per-user:fixed-window:[a-f0-9]{64}:user-123$/,
      );
    });

    it('includes the scope as the first segment after the prefix', () => {
      const config: AlgorithmConfig = {
        name: 'token-bucket',
        capacity: 100,
        refillRate: 10,
      };

      const result = addConfigToKey(config, 'api-key', 'costly');

      expect(result.split(':').slice(0, 3)).toEqual([
        'ratelimit',
        'costly',
        'token-bucket',
      ]);
    });

    it('includes the original key at the end', () => {
      const config: AlgorithmConfig = {
        name: 'fixed-window',
        window: 60,
        limit: 100,
      };

      const result = addConfigToKey(config, 'original-key', 'r');

      expect(result).toMatch(/:original-key$/);
    });

    it('produces a 64-character hex hash (SHA-256) in the fourth segment', () => {
      const config: AlgorithmConfig = {
        name: 'sliding-window',
        window: 120,
        limit: 500,
      };

      const result = addConfigToKey(config, 'test-key', 'r');
      const hashPart = result.split(':')[3];

      expect(hashPart).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('config property ordering', () => {
    it('produces the same hash regardless of property order', () => {
      const config1: AlgorithmConfig = {
        name: 'fixed-window',
        window: 60,
        limit: 100,
      };
      const config2: AlgorithmConfig = {
        limit: 100,
        name: 'fixed-window',
        window: 60,
      };

      expect(addConfigToKey(config1, 'test-key', 'r')).toBe(
        addConfigToKey(config2, 'test-key', 'r'),
      );
    });

    it('produces the same hash when properties are added in different order', () => {
      const config1: AlgorithmConfig = {
        name: 'token-bucket',
        capacity: 100,
        refillRate: 10,
      };
      const config2: AlgorithmConfig = {
        refillRate: 10,
        capacity: 100,
        name: 'token-bucket',
      };

      expect(addConfigToKey(config1, 'test-key', 'r')).toBe(
        addConfigToKey(config2, 'test-key', 'r'),
      );
    });
  });

  describe('scope segment', () => {
    it('isolates state: same config and key, different scope → different key', () => {
      const config: AlgorithmConfig = {
        name: 'fixed-window',
        window: 60,
        limit: 100,
      };

      const a = addConfigToKey(config, 'acc:1', 'user');
      const b = addConfigToKey(config, 'acc:1', 'costly');

      expect(a).not.toBe(b);
    });

    it('shares state: same scope, config, and key → identical key', () => {
      const config: AlgorithmConfig = {
        name: 'token-bucket',
        capacity: 600,
        refillRate: 10,
      };

      const reads = addConfigToKey(config, 't:1', 'tenant');
      const writes = addConfigToKey(config, 't:1', 'tenant');

      expect(reads).toBe(writes);
    });

    it('does not fold the scope into the config hash', () => {
      const config: AlgorithmConfig = {
        name: 'fixed-window',
        window: 60,
        limit: 100,
      };

      const hashOf = (scope: string) =>
        addConfigToKey(config, 'k', scope).split(':')[3];

      expect(hashOf('scope-a')).toBe(hashOf('scope-b'));
    });
  });

  describe('uniqueness for different configs', () => {
    it('produces different hashes for different config values', () => {
      const config1: AlgorithmConfig = {
        name: 'fixed-window',
        window: 60,
        limit: 100,
      };
      const config2: AlgorithmConfig = {
        name: 'fixed-window',
        window: 60,
        limit: 200,
      };

      expect(addConfigToKey(config1, 'same-key', 'r')).not.toBe(
        addConfigToKey(config2, 'same-key', 'r'),
      );
    });

    it('produces different hashes for different algorithms', () => {
      const config1: AlgorithmConfig = {
        name: 'fixed-window',
        window: 60,
        limit: 100,
      };
      const config2: AlgorithmConfig = {
        name: 'sliding-window',
        window: 60,
        limit: 100,
      };

      expect(addConfigToKey(config1, 'test-key', 'r')).not.toBe(
        addConfigToKey(config2, 'test-key', 'r'),
      );
    });
  });

  describe('uniqueness for different keys', () => {
    it('produces different modified keys for different original keys', () => {
      const config: AlgorithmConfig = {
        name: 'fixed-window',
        window: 60,
        limit: 100,
      };

      const result1 = addConfigToKey(config, 'key1', 'r');
      const result2 = addConfigToKey(config, 'key2', 'r');

      expect(result1).not.toBe(result2);
      expect(result1).toContain(':key1');
      expect(result2).toContain(':key2');
    });

    it('preserves the original key even with special characters', () => {
      const config: AlgorithmConfig = {
        name: 'fixed-window',
        window: 60,
        limit: 100,
      };

      const result = addConfigToKey(config, 'user:123:admin', 'r');

      expect(result).toMatch(/:user:123:admin$/);
    });
  });

  describe('algorithm-specific configs', () => {
    it.each([
      ['fixed-window', { window: 60, limit: 100 }],
      ['token-bucket', { capacity: 100, refillRate: 10 }],
      ['leaky-bucket', { capacity: 100, leakRate: 10 }],
      ['sliding-window', { window: 60, limit: 100 }],
      ['sliding-window-counter', { window: 60, limit: 100 }],
      ['gcra', { burst: 100, interval: 60 }],
    ])('formats a %s config correctly', (name, rest) => {
      const result = addConfigToKey(
        { name, ...rest } as AlgorithmConfig,
        'key',
        'scope',
      );

      expect(result).toBe(
        `ratelimit:scope:${name}:${result.split(':')[3]}:key`,
      );
      expect(result).toMatch(
        new RegExp(`^ratelimit:scope:${name}:[a-f0-9]{64}:key$`),
      );
    });
  });

  describe('consistency', () => {
    it('always produces the same result for the same inputs', () => {
      const config: AlgorithmConfig = {
        name: 'fixed-window',
        window: 60,
        limit: 100,
      };

      const result1 = addConfigToKey(config, 'consistent-key', 'r');
      const result2 = addConfigToKey(config, 'consistent-key', 'r');
      const result3 = addConfigToKey(config, 'consistent-key', 'r');

      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
    });
  });

  describe('edge cases', () => {
    it('handles keys with colons', () => {
      const config: AlgorithmConfig = {
        name: 'fixed-window',
        window: 60,
        limit: 100,
      };

      const result = addConfigToKey(config, 'namespace:resource:id', 'r');

      expect(result).toMatch(/:namespace:resource:id$/);
    });

    it('handles an empty string key', () => {
      const config: AlgorithmConfig = {
        name: 'fixed-window',
        window: 60,
        limit: 100,
      };

      const result = addConfigToKey(config, '', 'r');

      expect(result).toMatch(/^ratelimit:r:fixed-window:[a-f0-9]{64}:$/);
    });

    it('handles numeric values in config', () => {
      const config: AlgorithmConfig = {
        name: 'fixed-window',
        window: 3600,
        limit: 10000,
      };

      const result = addConfigToKey(config, 'key', 'r');

      expect(result).toMatch(/^ratelimit:r:fixed-window:[a-f0-9]{64}:key$/);
    });
  });
});
