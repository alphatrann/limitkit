/**
 * Mock clock implementation for testing rate limiting behavior.
 *
 * This module provides a FakeClock implementation that allows tests to control
 * time progression independently of system time. Useful for testing rate limiting
 * algorithms without waiting for real time to pass.
 *
 * @example
 * ```typescript
 * const clock = new FakeClock();
 * const store = new RedisStore(redis, clock);
 *
 * // Simulate 5 seconds passing
 * clock.advance(5000);
 *
 * // Time-sensitive operations can now be tested instantly
 * ```
 */

import { Clock } from "../src";

/**
 * A controllable clock for testing that allows manual time advancement.
 *
 * Starts at time 0 and tracks elapsed time through advance() calls.
 * Useful for unit testing rate limiting logic without actual delays.
 *
 * @implements {Clock}
 */
export class FakeClock implements Clock {
  /** Current simulated time in milliseconds */
  private currentMs = 0;

  /**
   * Returns the current simulated time.
   *
   * @returns Current time in milliseconds (controlled via advance())
   */
  now(): number {
    return this.currentMs;
  }

  /**
   * Advances the simulated time by the specified amount.
   *
   * @param ms - Number of milliseconds to advance
   *
   * @example
   * ```typescript
   * const clock = new FakeClock();
   * console.log(clock.now()); // 0
   * clock.advance(1000);
   * console.log(clock.now()); // 1000
   * clock.advance(500);
   * console.log(clock.now()); // 1500
   * ```
   */
  advance(ms: number) {
    this.currentMs += ms;
  }
}
