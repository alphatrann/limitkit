import { LimitRule } from "./limit-rule";
import { Store } from "./store";

export interface RateLimitConfig<C> {
  rules: LimitRule<C>[];
  store: Store;
  debug?: boolean;
}
