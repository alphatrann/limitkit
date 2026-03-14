import { RateLimitResult } from "@limitkit/core";

export interface InMemoryCompatible<TState> {
  process(
    state: TState | undefined,
    now: number,
    cost: number,
  ): {
    state: TState;
    output: RateLimitResult;
  };
}
