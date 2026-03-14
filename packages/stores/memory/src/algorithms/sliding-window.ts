import {
  BadArgumentsException,
  RateLimitResult,
  SlidingWindow,
} from "@limitkit/core";
import { InMemoryCompatible, SlidingWindowState } from "../types";

export class InMemorySlidingWindow
  extends SlidingWindow
  implements InMemoryCompatible<SlidingWindowState>
{
  /**
   * In-memory implementation of the sliding window algorithm using circular buffer
   * Total time complexity: O(1)
   * @warning The timestamps in the state are modified in place to reduce memory allocation.
   * @param state internal state of sliding window algorithm
   * @param now unix timestamp in millisecond
   * @param cost cost per request, must never exceed `this.config.limit`
   */
  process(
    state: SlidingWindowState | undefined,
    now: number,
    cost: number = 1,
  ): { state: SlidingWindowState; output: RateLimitResult } {
    if (cost > this.config.limit)
      throw new BadArgumentsException(
        `Cost must never exceed config.limit, (cost=${cost}, config.limit=${this.config.limit})`,
      );
    if (!state)
      state = {
        head: 0,
        size: 0,
        buffer: new Array(this.config.limit).fill(null),
      };

    const { buffer } = state;
    const limit = this.config.limit;
    const windowMs = this.config.window * 1000;

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
      const newest = buffer[(head + size - 1) % limit];
      const reset = newest + windowMs;
      const retryAfter = Math.max(0, Math.ceil((reset - now) / 1000));
      return {
        state,
        output: {
          allowed: false,
          limit,
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
    return { state, output: { allowed: true, limit, remaining, reset } };
  }
}
