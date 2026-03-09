import { AlgorithmConfig } from "./algorithm-config";

/**
 * @description represents the rate limit rule
 */
export interface LimitRule<C> {
  /**
   * @description a unique identifier of the rule, which can be overriden later
   */
  name: string;

  /**
   * @description either a fixed string, or a dynamic string extracted from a provided context
   */
  key: string | ((ctx: C) => string);

  /**
   * @description (optional) either a fixed value, or a dynamic value extracted from a provided context. Cost adds weights to each request, which makes requests hit rate limits faster. By default, it is set to 1.
   */
  cost?: number | ((ctx: C) => number);

  /**
   * @description the rule config, which takes a fixed object or an object dynamically adjusted based on the provided context.
   */
  policy: PolicyResolver<C>;
}

type PolicyResolver<C> =
  | AlgorithmConfig
  | ((ctx: C) => AlgorithmConfig)
  | ((ctx: C) => Promise<AlgorithmConfig>);
