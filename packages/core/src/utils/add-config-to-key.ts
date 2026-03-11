import { createHash } from "crypto";
import { AlgorithmConfig } from "../types";

export function addConfigToKey(config: AlgorithmConfig, key: string) {
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
