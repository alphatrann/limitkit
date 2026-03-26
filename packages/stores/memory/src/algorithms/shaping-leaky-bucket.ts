import {
  BadArgumentsException,
  LeakyBucket,
  RateLimitRuleResult,
} from "@limitkit/core";
import { InMemoryCompatible, ShapingLeakyBucketState } from "../types";

/**
 * In-memory implementation of the **Shaping Leaky Bucket** algorithm.
 *
 * This variant is intended for **traffic shaping** rather than traditional HTTP rate limiting.
 * Requests are scheduled to execute at a constant rate defined by `leakRate`.
 * Instead of immediate rejection, requests may be delayed until the bucket allows execution.
 *
 * ## Use Cases
 * - Worker queues
 * - Sending outbound requests
 * - Handling backpressure
 * - Downstream systems cannot tolerate bursts
 *
 * ⚠️ Not typically used for HTTP/GraphQL request limiting because `allowed = true`
 * does not guarantee immediate execution.
 *
 * ## Characteristics
 * - Smooths bursts into a predictable, constant rate
 * - Queue-based model
 * - Provides deterministic scheduling (`availableAt`) for delayed execution
 * - Rejects requests only if adding them exceeds capacity
 *
 * ## Usage
 * ```ts
 * import { InMemoryShapingLeakyBucket, InMemoryStore } from "@limitkit/memory";
 *
 * const shaper = new InMemoryShapingLeakyBucket({
 *   name: "leaky-bucket",
 *   capacity: 100,
 *   leakRate: 2, // requests per second
 * });
 *
 * const store = new InMemoryStore();
 *
 * const result = store.consume(key, shaper, Date.now(), 1);
 * // schedule execution based on `availableAt`
 * setTimeout(() => handleJob(), result.availableAt - Date.now());
 * ```
 * @extends LeakyBucket
 * @implements {InMemoryCompatible<ShapingLeakyBucketState>}
 */
export class InMemoryShapingLeakyBucket
  extends LeakyBucket
  implements InMemoryCompatible<ShapingLeakyBucketState>
{
  /**
   * Process a request using the leaky bucket scheduling algorithm.
   *
   * - Calculates the earliest execution time (`availableAt`) based on
   *   the bucket's current schedule and leak rate.
   * - Rejects requests if adding them would exceed bucket capacity.
   *
   * ## Complexity
   * - Time: **O(1)**
   * - Space: **O(1)**
   *
   * @param state Previous bucket state (`nextFreeAt`)
   * @param now Current Unix timestamp in milliseconds
   * @param cost Number of tokens to consume (default: 1)
   *
   * @returns Updated state and result containing:
   * @throws BadArgumentsException if `cost > config.capacity`
   */
  process(
    state: ShapingLeakyBucketState | undefined,
    now: number,
    cost: number = 1,
  ): { state: ShapingLeakyBucketState; output: RateLimitRuleResult } {
    if (cost > this.config.capacity)
      throw new BadArgumentsException(
        `Cost must never exceed config.capacity, (cost=${cost}, config.capacity=${this.config.capacity})`,
      );
    if (!state) state = { nextFreeAt: now };
    const { capacity, leakRate } = this.config;

    let { nextFreeAt } = state;
    if (nextFreeAt < now) nextFreeAt = now;

    const delay = nextFreeAt - now;
    const queueSize = delay * (leakRate / 1000);

    // ----- reject -----
    if (queueSize + cost > capacity) {
      const resetAt = now + (queueSize / leakRate) * 1000;
      return {
        state: { nextFreeAt },
        output: {
          allowed: false,
          limit: capacity,
          remaining: 0,
          resetAt,
          availableAt: nextFreeAt,
        },
      };
    }

    // ----- accept -----
    nextFreeAt += (cost / leakRate) * 1000;

    const resetAt = now + ((queueSize + cost) / leakRate) * 1000;
    const remaining = Math.max(0, Math.floor(capacity - (queueSize + cost)));

    return {
      state: { nextFreeAt },
      output: {
        allowed: true,
        limit: capacity,
        remaining,
        resetAt,
        availableAt: nextFreeAt,
      },
    };
  }
}
