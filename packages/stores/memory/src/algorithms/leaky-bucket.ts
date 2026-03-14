import { BadArgumentsException, LeakyBucket } from "@limitkit/core";
import { InMemoryCompatible, LeakyBucketState } from "../types";

/**
 * In-memory implementation of the leaky bucket algorithm
 *
 * Usage:
 * ```ts
 * const inMemoryLeakyBucket = new InMemoryLeakyBucket({ name: "leaky-bucket", capacity: 100, leakRate: 2 })
 * ```
 */
export class InMemoryLeakyBucket
  extends LeakyBucket
  implements InMemoryCompatible<LeakyBucketState>
{
  /**
   * Computes the next leaky bucket state based on the configuration and given parameters
   * * Total time complexity: O(1)
   * * Total space complexity: O(1)
   *
   * @param state Internal state of leaky bucket algorithm
   * @param now Current Unix timestamp in millisecond
   * @param cost Optional cost/weight of each request. Defaults to 1 if not specified. Must never exceed `this.config.capacity`
   * @returns The next state and rate limit result
   * @see LeakyBucketState
   */
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
