import { LimitRule } from "./limit-rule";
import { Store } from "./store";

export interface RateLimitConfig<C = unknown> {
  rules: LimitRule<C>[];
  store: Store;
  debug?: boolean;
}
