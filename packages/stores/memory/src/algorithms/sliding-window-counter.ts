import {
  BadArgumentsException,
  SlidingWindowCounterConfig,
} from "@limitkit/core";
import { SlidingWindowCounterState, AlgorithmResult } from "../types";

/**
 * Implementation of the sliding window counter
 * Total time complexity: O(1)
 * @param state internal state of sliding window counter algorithm
 * @param config config for sliding window counter algorithm
 * @param now unix timestamp in millisecond
 * @param cost cost per request, must never exceed `config.limit`
 */
export function slidingWindowCounter(
  state: SlidingWindowCounterState,
  config: SlidingWindowCounterConfig,
  now: number,
  cost: number = 1,
): AlgorithmResult {
  if (config.limit <= 0)
    throw new BadArgumentsException(
      `Rate limit must be a positive integer, got limit=${config.limit}`,
    );

  const limit = config.limit;
  const windowInMs = config.window * 1000;
  let { count, prevCount, windowStart } = state;

  let elapsed = now - windowStart;
  if (elapsed >= windowInMs) {
    const windowsPassed = Math.floor(elapsed / windowInMs);

    prevCount = windowsPassed === 1 ? count : 0;
    count = 0;
    windowStart += windowsPassed * windowInMs;
    elapsed = now - windowStart;
  }

  const progress = elapsed / windowInMs;
  const effective = count + (1 - progress) * prevCount;
  const reset = windowStart + 2 * windowInMs;

  if (effective + cost > limit) {
    const retryAfter = Math.max(
      0,
      Math.ceil((windowStart + windowInMs - now) / 1000),
    );
    return {
      state: { windowStart, prevCount, count },
      output: { reset, limit, remaining: 0, retryAfter, allowed: false },
    };
  }

  count += cost;
  const remaining = Math.max(0, Math.floor(limit - (effective + cost)));
  return {
    state: { count, prevCount, windowStart },
    output: { reset, limit, remaining, allowed: true },
  };
}
