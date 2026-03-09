import { RateLimitResult } from "./rate-limit-result";
import { State } from "./state";

export type AlgorithmResult = {
  state: State;
  output: RateLimitResult;
};
