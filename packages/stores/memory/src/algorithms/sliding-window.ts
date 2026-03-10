import { BadArgumentsException, SlidingWindowConfig } from "@limitkit/core";
import { AlgorithmResult, SlidingWindowState } from "../types";

/**
 * Implementation of the sliding window algorithm using circular buffer
 * Total time complexity: O(1)
 * @warning The timestamps in the state are modified in place to reduce memory allocation.
 * @param state internal state of sliding window algorithm
 * @param config config for sliding window algorithm
 * @param now unix timestamp in millisecond
 * @param cost cost per request, must never exceed `config.limit`
 */
export function slidingWindow(
  state: SlidingWindowState,
  config: SlidingWindowConfig,
  now: number,
  cost: number,
): AlgorithmResult {
  if (config.limit <= 0)
    throw new BadArgumentsException(
      `Rate limit must be a positive integer, got limit=${config.limit}`,
    );

  const { buffer } = state;
  const limit = config.limit;
  const windowMs = config.window * 1000;

  let { head, size } = state;

  // remove expired timestamps (amortized O(1))
  while (size > 0) {
    const oldest = buffer[head];
    if (now - oldest < windowMs) break;
    head = (head + 1) % limit;
    size--;
  }

  // reject
  if (size + cost > limit) {
    const oldest = buffer[head];
    const newest = buffer[(head + size - 1) % limit];
    const reset = newest + windowMs;
    const retryAfter = Math.max(0, Math.ceil(oldest + windowMs) / 1000);
    return {
      state,
      output: {
        allowed: false,
        remaining: 0,
        reset,
        retryAfter,
      },
    };
  }

  // allow
  for (let i = 0; i < cost; i++) {
    const index = (head + size) % limit;
    buffer[index] = now;
    size++;
  }

  state.head = head;
  state.size = size;

  const remaining = limit - size;
  const reset = buffer[(head + size - 1) % limit] + windowMs;
  return { state, output: { allowed: true, remaining, reset } };
}
