/**
 * System clock implementation that provides the current time.
 *
 * This module exports a Clock implementation that uses the system's current time
 * (Date.now()). It's the default clock used by RedisStore for timestamp operations
 * in rate limiting algorithms.
 *
 * @see Clock
 */

import { Clock } from "./types";

/**
 * System clock that returns the current Unix timestamp in milliseconds.
 *
 * Uses JavaScript's native Date.now() to provide wall-clock time.
 * This is the real-time clock implementation used in production.
 *
 * @implements {Clock}
 */
export class SystemClock implements Clock {
  /**
   * Returns the current Unix timestamp in milliseconds.
   *
   * @returns Current time in milliseconds since Unix epoch (January 1, 1970)
   */
  now(): number {
    return Date.now();
  }
}
