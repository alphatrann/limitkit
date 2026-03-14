import { BadArgumentsException, LeakyBucket } from "@limitkit/core";
import { InMemoryCompatible, LeakyBucketState } from "../types";

/**
 * In-memory implementation of leaky bucket
 * Total time complexity: O(1)
 *
 * @param state internal state of leaky bucket algorithm
 * @param now unix timestamp in milliseconds
 * @param cost cost per request
 */

export class InMemoryLeakyBucket
  extends LeakyBucket
  implements InMemoryCompatible<LeakyBucketState>
{
  process(state: LeakyBucketState | undefined, now: number, cost: number = 1) {
    if (cost > this.config.capacity)
      throw new BadArgumentsException(
        `Cost must never exceed config.capacity, (cost=${cost}, config.capacity=${this.config.capacity})`,
      );
    if (!state) state = { queueSize: 0, lastLeak: now };
    const capacity = this.config.capacity;
    const leakRate = this.config.leakRate;

    let { queueSize, lastLeak } = state;
    if (lastLeak === null) lastLeak = now;

    // ----- leak -----
    const elapsedSeconds = (now - lastLeak) / 1000;
    queueSize = Math.max(0, queueSize - elapsedSeconds * leakRate);
    lastLeak = now;

    // ----- reject -----
    if (queueSize + cost > capacity) {
      const overflow = queueSize + cost - capacity;
      const retryMs = (overflow / leakRate) * 1000;

      const retryAfter = Math.max(0, Math.ceil(retryMs / 1000));
      const reset = now + (queueSize / leakRate) * 1000;
      return {
        state: { lastLeak, queueSize },
        output: {
          allowed: false,
          limit: capacity,
          remaining: 0,
          reset,
          retryAfter,
        },
      };
    }

    // ----- accept -----
    queueSize += cost;

    const reset = now + (queueSize / leakRate) * 1000;
    const remaining = Math.max(0, Math.floor(capacity - queueSize));

    return {
      state: { queueSize, lastLeak },
      output: {
        allowed: true,
        limit: capacity,
        remaining,
        reset,
      },
    };
  }
}
