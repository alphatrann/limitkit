/**
 * Interface for time providers in rate limiting operations.
 *
 * This abstraction allows different time implementations to be used:
 * - SystemClock: Uses real system time (Date.now())
 * - FakeClock: Allows controlled time advancement for testing
 * - CustomClock: Can be implemented for specific timing requirements
 *
 * @example
 * ```typescript
 * // Production usage with system time
 * const clock = new SystemClock();
 * const store = new RedisStore(redis, clock);
 *
 * // Testing with controlled time
 * const testClock = new FakeClock();
 * const store = new RedisStore(redis, testClock);
 * testClock.advance(5000); // Simulate 5 seconds passing
 * ```
 */
export interface Clock {
  /**
   * Returns the current time in milliseconds since Unix epoch.
   *
   * @returns Current time in milliseconds
   */
  now(): number;
}
