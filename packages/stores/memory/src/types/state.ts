export type TokenBucketState = {
  /** Available tokens in the bucket */
  tokens: number;
  /** Timestamp of the last token refill (ms) */
  lastRefill: number | null;
};

export type LeakyBucketState = {
  /** Number of requests currently in the queue */
  queueSize: number;
  /** Timestamp of the last leak event (ms) */
  lastLeak: number | null;
};

export type FixedWindowState = {
  /** Number of requests in the current window */
  count: number;
  /** Timestamp when the current window started */
  windowStart: number;
};

export type SlidingWindowState = {
  /** Fixed array of timestamps (ms) in **ascending** order */
  buffer: number[];

  /** Index of the oldest element */
  head: number;

  /** Number of active timestamps */
  size: number;
};

export type SlidingWindowCounterState = {
  /** Request count in the current window */
  count: number;

  /** Request count from the previous window */
  prevCount: number;

  /** Start timestamp of the current window (ms) */
  windowStart: number;
};

export type GCRAState = {
  /** Theoretical Arrival Time for the next eligible request */
  tat: number;
};

/**
 * Represents the state of various rate-limiting algorithms.
 *
 * This is a discriminated union type that can hold the internal state for different
 * rate limiting strategies. Each algorithm maintains its own state structure to track
 * request rates and enforce limits.
 *
 * @typedef {TokenBucketState | FixedWindowState | SlidingWindowState | SlidingWindowCounterState | LeakyBucketState | GCRAState | Record<string, any>} State
 *
 * @property {TokenBucketState} - Token Bucket algorithm state. Maintains available tokens
 *           and the last refill timestamp for continuous token replenishment.
 *
 * @property {FixedWindowState} - Fixed Window algorithm state. Tracks request counts within
 *           fixed time intervals (e.g., per second, per minute).
 *
 * @property {SlidingWindowState} - Sliding Window algorithm state. Maintains a rolling window
 *           of requests to provide smoother rate limiting than fixed windows.
 *
 * @property {SlidingWindowCounterState} - Sliding Window Counter algorithm state. Combines
 *           fixed and sliding window approaches using a counter-based mechanism.
 *
 * @property {LeakyBucketState} - Leaky Bucket algorithm state. Simulates a bucket that leaks
 *           at a constant rate while accepting incoming requests.
 *
 * @property {GCRAState} - Generic Cell Rate Algorithm (GCRA) state. Implements a rate limiting
 *           algorithm based on theoretical cell rate calculations.
 *
 * @property {Record<string, any>} - Fallback type for custom or unknown state structures
 *           to allow extensibility for custom rate limiting algorithms.
 */
export type State =
  | TokenBucketState
  | FixedWindowState
  | SlidingWindowState
  | SlidingWindowCounterState
  | LeakyBucketState
  | GCRAState
  | Record<string, any>;
