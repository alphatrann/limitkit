import {
  BadArgumentsException,
  RateLimitResult,
  SlidingWindow,
} from "@limitkit/core";
import { InMemoryCompatible, SlidingWindowState } from "../types";

/**
 * In-memory implementation of the **Sliding Window** rate limiting algorithm.
 *
 * This algorithm tracks individual request timestamps within a rolling window
 * and ensures no more than `limit` requests occur within `window` seconds.
 *
 * A circular buffer is used to efficiently store timestamps.
 *
 * ## Characteristics
 * - More accurate than fixed window
 * - Prevents boundary bursts
 * - Memory proportional to `limit`
 *
 * ## Usage
 * ```ts
 * import { InMemorySlidingWindow } from "@limitkit/memory";
 *
 * const limiter = new InMemorySlidingWindow({
 *   name: "sliding-window",
 *   limit: 100,
 *   window: 60
 * });
 * ```
 *
 * @warning
 * The internal buffer is **mutated in place** to avoid unnecessary allocations.
 *
 * @extends SlidingWindow
 * @implements {InMemoryCompatible<SlidingWindowState>}
 */
export class InMemorySlidingWindow
  extends SlidingWindow
  implements InMemoryCompatible<SlidingWindowState>
{
  /**
   * Processes a request using the sliding window algorithm.
   *
   * Expired timestamps are removed from the circular buffer and new
   * timestamps are inserted if capacity allows.
   *
   * ## Complexity
   * - Time: **Amortized O(1)**
   * - Space: **O(limit)**
   *
   * @param state Previous sliding window state
   * @param now Current Unix timestamp **in milliseconds**
   * @param cost Number of requests to consume (default: `1`)
   *
   * @returns Updated state and rate limit result
   *
   * @throws BadArgumentsException if `cost > config.limit`
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
