import { createHash } from 'crypto';
import { AlgorithmConfig } from '../types';

/**
 * Namespace a user-defined rate limiting key with everything that must not
 * share state with it:
 *
 * * `scope` — the rule's {@link LimitRule.bucket} or, by default, its
 *   {@link LimitRule.name}. Two rules only share quota when they resolve to the
 *   same scope, so renaming a rule (or giving it a distinct `bucket`) isolates
 *   its counter even when the algorithm, config, and resolved key are identical.
 * * the algorithm name, e.g. `"fixed-window"`, `"sliding-window"`.
 * * a SHA-256 hash of the algorithm config (keys sorted, so property order
 *   doesn't matter). `scope` is **not** part of this hash — it is already a
 *   literal segment — so changing `bucket` doesn't perturb the config hash.
 *
 * @warning Avoid nested or non-primitive config values to keep the hash deterministic.
 *
 * The modified key has the format:
 * `ratelimit:{scope}:{algorithm_name}:{sha256(config)}:{key}`
 *
 * Folding all of this into the key means a store never serves state that was
 * written under a different scope, algorithm, or config.
 *
 * @param config The algorithm config object
 * @param key The user-defined key
 * @param scope The rule's `bucket` or `name` — the quota-sharing boundary
 * @returns {string} A modified key with the format above
 */
export function addConfigToKey(
  config: AlgorithmConfig,
  key: string,
  scope: string,
): string {
  const sortedKeys = Object.keys(config ?? {}).sort();
  const sortedConfig = sortedKeys.reduce((acc, k) => {
    acc[k] = (config as any)[k];
    return acc;
  }, {} as any);
  const configJson = JSON.stringify(sortedConfig);
  const hashedConfig = createHash('sha256').update(configJson).digest('hex');
  const modifiedKey = `ratelimit:${scope}:${config.name}:${hashedConfig}:${key}`;
  return modifiedKey;
}
