import { createHash } from "crypto";
import { AlgorithmConfig } from "../types";

/**
 * Prepend additional data to user-defined rate limiting keys, which include:
 * * Rate limiting algorithm name e.g., `"fixed-window"`, `"sliding-window"`
 * * SHA-256 hash of the algorithm config object (deterministic order guaranteed)
 *
 * @warning Avoid nested or non-primitive key-value pairs to ensure deterministic hash value
 *
 * The modified key will have the format: `ratelimit:{algorithm_name}:{sha256_hash}:{key}`
 * @param config The algorithm config object
 * @param key The user-defined key
 * @returns {string} A modified key with the format above
 */
export function addConfigToKey(config: AlgorithmConfig, key: string): string {
  const sortedKeys = Object.keys(config).sort();
  const sortedConfig = sortedKeys.reduce((acc, k) => {
    acc[k] = (config as any)[k];
    return acc;
  }, {} as any);
  const configJson = JSON.stringify(sortedConfig);
  const hashedConfig = createHash("sha256").update(configJson).digest("hex");
  const modifiedKey = `ratelimit:${config.name}:${hashedConfig}:${key}`;
  return modifiedKey;
}
