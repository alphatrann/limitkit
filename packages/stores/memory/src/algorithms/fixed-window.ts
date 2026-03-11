import { AlgorithmResult, FixedWindowState } from "../types";
import { BadArgumentsException, FixedWindowConfig } from "@limitkit/core";

/**
 * Implementation of the fixed window algorithm
 * @param state internal state of fixed window algorithm
 * @param config config for fixed window algorithm
 * @param now unix timestamp in millisecond
 * @param cost cost per request, must never exceed `config.limit`
 */
export function fixedWindow(
  state: FixedWindowState,
  config: FixedWindowConfig,
  now: number,
  cost: number = 1,
): AlgorithmResult {
  if (config.limit <= 0)
    throw new BadArgumentsException(
      `Rate limit must be a positive integer, got limit=${config.limit}`,
    );

  if (cost > config.limit)
    throw new BadArgumentsException(
      `Cost should never exceeded limit, expected to be below limit=${config.limit}, got cost=${cost}`,
    );

  const windowInMs = config.window * 1000;
  const isStillInCurrentWindow = now - state.windowStart < windowInMs;

  const hasExceededLimit = state.count + cost > config.limit;
  if (isStillInCurrentWindow && hasExceededLimit) {
    const reset = state.windowStart + windowInMs;
    const retryAfter = Math.max(0, Math.ceil((reset - now) / 1000));
    return {
      state,
      output: { allowed: false, remaining: 0, reset, retryAfter },
    };
  }
  const newState = { ...state };
  if (!isStillInCurrentWindow) {
    newState.windowStart = now - (now % windowInMs);
    newState.count = 0;
  }
  const reset = newState.windowStart + windowInMs;
  newState.count += cost;
  const remaining = config.limit - newState.count;
  return { state: newState, output: { allowed: true, remaining, reset } };
}
