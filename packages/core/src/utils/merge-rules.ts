import { LimitRule } from "../types";

/**
 * Merge two arrays of rules by name such that:
 * * Local rules override global rules if the name matches
 * * New local rules are appended
 * @param globalRules The global rules to be overriden
 * @param localRules The local rules to be appended or to override global rules
 * @returns {LimitRule<C>[]} A new list of rules merged from `globalRules` and `localRules`
 */
export function mergeRules<C>(
  globalRules: LimitRule<C>[] = [],
  localRules: LimitRule<C>[] = [],
): LimitRule<C>[] {
  const map = new Map<string, LimitRule<C>>();

  for (const rule of globalRules) {
    map.set(rule.name, rule);
  }

  for (const rule of localRules) {
    if (map.has(rule.name)) {
      map.set(rule.name, {
        ...map.get(rule.name)!,
        ...rule,
      });
    } else {
      map.set(rule.name, rule);
    }
  }

  return [...map.values()];
}
