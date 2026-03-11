/**
 * Enumeration of supported rate limiting algorithms.
 *
 * Each algorithm offers different trade-offs in terms of accuracy, memory usage, and behavior:
 * - **FixedWindow**: Simple, resets at fixed intervals (e.g., every minute)
 * - **SlidingWindow**: Memory-intensive but more accurate than fixed window
 * - **SlidingWindowCounter**: Hybrid approach with better accuracy than fixed window
 * - **TokenBucket**: Allows burst traffic while maintaining average rate
 * - **LeakyBucket**: Smooths traffic flow, good for queue management
 * - **GCRA**: Generic Cell Rate Algorithm, precise and memory-efficient for telecom use cases
 */
export enum Algorithm {
  FixedWindow = "fixed-window",
  SlidingWindow = "sliding-window",
  SlidingWindowCounter = "sliding-window-counter",
  TokenBucket = "token-bucket",
  LeakyBucket = "leaky-bucket",
  GCRA = "gcra",
}

/**
 * Configuration shared by window-based algorithms (FixedWindow, SlidingWindow, SlidingWindowCounter).
 */
interface WindowConfig {
  /**
   * Window duration in seconds. Resets occur at this interval.
   */
  window: number;

  /**
   * Maximum number of requests allowed within the window.
   */
  limit: number;
}

export interface FixedWindowConfig extends WindowConfig {
  name: Algorithm.FixedWindow;
}

export interface SlidingWindowConfig extends WindowConfig {
  name: Algorithm.SlidingWindow;
}

export interface SlidingWindowCounterConfig extends WindowConfig {
  name: Algorithm.SlidingWindowCounter;
}

export interface TokenBucketConfig {
  name: Algorithm.TokenBucket;
  /**
   * Number of tokens to add back to the bucket per second.
   */
  refillRate: number;
  /**
   * Maximum capacity of the bucket (total tokens it can hold).
   */
  capacity: number;
}

export interface LeakyBucketConfig {
  name: Algorithm.LeakyBucket;
  /**
   * Number of requests to process and leak from the queue per second.
   */
  leakRate: number;
  /**
   * Maximum number of requests that can be queued at once.
   */
  capacity: number;
}

export interface GCRAConfig {
  name: Algorithm.GCRA;
  /**
   * Time interval between request allowances in seconds (1/max-rate bucket).
   */
  interval: number;
  /**
   * Number of requests that can arrive simultaneously without penalty.
   */
  burst: number;
}

/**
 * Configuration for supported rate limiting algorithms.
 *
 * Use the appropriate algorithm configuration based on your use case:
 * - Window-based (FixedWindow, SlidingWindow, SlidingWindowCounter): Simple rate limiting
 * - TokenBucket: Supports traffic bursts while maintaining average rate
 * - LeakyBucket: Smooths traffic, prevents bursts
 * - GCRA: Precise rate limiting with low memory overhead
 */
export type AlgorithmConfig =
  | FixedWindowConfig
  | SlidingWindowConfig
  | SlidingWindowCounterConfig
  | TokenBucketConfig
  | LeakyBucketConfig
  | GCRAConfig;
