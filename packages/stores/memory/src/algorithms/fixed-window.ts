import { FixedWindowState, InMemoryCompatible } from "../types";
import {
  BadArgumentsException,
  FixedWindow,
  RateLimitResult,
} from "@limitkit/core";

export class InMemoryFixedWindow
  extends FixedWindow
  implements InMemoryCompatible<FixedWindowState>
{
  /**
   * In-memory implementation of the fixed window algorithm
   * @param state internal state of fixed window algorithm
   * @param now unix timestamp in millisecond
   * @param cost cost per request, must never exceed `this.config.limit`
   */
  process(
    state: FixedWindowState | undefined,
    now: number,
    cost: number = 1,
  ): { state: FixedWindowState; output: RateLimitResult } {
    if (cost > this.config.limit)
      throw new BadArgumentsException(
        `Cost must never exceed config.limit, (cost=${cost}, config.limit=${this.config.limit})`,
      );
    const windowInMs = this.config.window * 1000;
    if (!state) state = { windowStart: now - (now % windowInMs), count: 0 };

    const isStillInCurrentWindow = now - state.windowStart < windowInMs;

    const hasExceededLimit = state.count + cost > this.config.limit;
    if (isStillInCurrentWindow && hasExceededLimit) {
      const reset = state.windowStart + windowInMs;
      const retryAfter = Math.max(0, Math.ceil((reset - now) / 1000));
      return {
        state,
        output: {
          allowed: false,
          remaining: 0,
          limit: this.config.limit,
          reset,
          retryAfter,
        },
      };
    }
    const newState = { ...state };
    if (!isStillInCurrentWindow) {
      newState.windowStart = now - (now % windowInMs);
      newState.count = 0;
    }
    const reset = newState.windowStart + windowInMs;
    newState.count += cost;
    const remaining = this.config.limit - newState.count;
    return {
      state: newState,
      output: { allowed: true, limit: this.config.limit, remaining, reset },
    };
  }
}
