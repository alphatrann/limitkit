import { RateLimitResult } from "@limitkit/core";

/**
 * Represents a strategy that can be executed in-memory.
 * @template TConfig - The configuration schema for the algorithm.
 */
export interface InMemoryCompatible<TState> {
  /**
   * Computes the next state based on the configuration and given parameters
   * @param state Algorithm-dependent state
   * @param now Current Unix timestamp in millisecond
   * @param cost Optional cost/weight of each request. Defaults to 1 if not specified.
   * @returns {{state: TState; output: RateLimitResult}} The next state and the rate limit result
   */
  process(
    state: TState | undefined,
    now: number,
    cost?: number,
  ): {
    state: TState;
    output: RateLimitResult;
  };
}
