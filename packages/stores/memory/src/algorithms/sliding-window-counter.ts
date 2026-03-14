import {
  BadArgumentsException,
  RateLimitResult,
  SlidingWindowCounter,
} from "@limitkit/core";
import { InMemoryCompatible, SlidingWindowCounterState } from "../types";

export class InMemorySlidingWindowCounter
  extends SlidingWindowCounter
  implements InMemoryCompatible<SlidingWindowCounterState>
{
  /**
   * In-memory implementation of the sliding window counter
   * Total time complexity: O(1)
   * @param state internal state of sliding window counter algorithm
   * @param now unix timestamp in millisecond
   * @param cost cost per request, must never exceed `this.config.limit`
   */
  process(
    state: SlidingWindowCounterState | undefined,
    now: number,
    cost: number = 1,
  ): { state: SlidingWindowCounterState; output: RateLimitResult } {
    if (cost > this.config.limit)
      throw new BadArgumentsException(
        `Cost must never exceed config.limit, (cost=${cost}, config.limit=${this.config.limit})`,
      );
    if (!state) state = { count: 0, prevCount: 0, windowStart: now };

    const limit = this.config.limit;
    const windowInMs = this.config.window * 1000;
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
}
