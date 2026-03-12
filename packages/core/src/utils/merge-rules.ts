import { LimitRule } from "../types";

export function mergeRules<C>(
  globalRules: LimitRule<C>[] = [],
  routeRules: LimitRule<C>[] = [],
): LimitRule<C>[] {
  const map = new Map<string, LimitRule<C>>();

  for (const rule of globalRules) {
    map.set(rule.name, rule);
  }

  for (const rule of routeRules) {
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
