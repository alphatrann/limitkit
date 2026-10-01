import { isRuleGroup, LimitRule, RuleOrGroup } from '@limitkit/core';

/**
 * Merge two arrays of rules by name such that:
 * * Local rules override global rules if the name matches
 * * New local rules are appended
 *
 * Groups take part in the merge by `name`; an unnamed group can't be matched,
 * so it is always kept as-is. When a local entry replaces a global one and both
 * are plain rules their fields are merged, otherwise the local entry wins.
 * @param globalRules The global rules to be overriden
 * @param localRules The local rules to be appended or to override global rules
 * @returns {RuleOrGroup<C>[]} A new list of rules merged from `globalRules` and `localRules`
 */
export function mergeRules<C>(
  globalRules?: LimitRule<C>[],
  localRules?: LimitRule<C>[],
): LimitRule<C>[];
export function mergeRules<C>(
  globalRules?: RuleOrGroup<C>[],
  localRules?: RuleOrGroup<C>[],
): RuleOrGroup<C>[];
export function mergeRules<C>(
  globalRules: RuleOrGroup<C>[] = [],
  localRules: RuleOrGroup<C>[] = [],
): RuleOrGroup<C>[] {
  const map = new Map<string | symbol, RuleOrGroup<C>>();
  const keyOf = (rule: RuleOrGroup<C>) => rule.name ?? Symbol('unnamed-group');

  for (const rule of globalRules) {
    map.set(keyOf(rule), rule);
  }

  for (const rule of localRules) {
    const key = keyOf(rule);
    const existing = map.get(key);
    if (existing && !isRuleGroup(existing) && !isRuleGroup(rule)) {
      map.set(key, { ...existing, ...rule });
    } else {
      map.set(key, rule);
    }
  }

  return [...map.values()];
}
