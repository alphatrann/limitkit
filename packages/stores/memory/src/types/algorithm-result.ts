import { RateLimitResult } from "@limitkit/core/src/types/rate-limit-result";
import { State } from "./state";

export type AlgorithmResult = {
  state: State;
  output: RateLimitResult;
};
