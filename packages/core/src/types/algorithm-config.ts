export enum Algorithm {
  FixedWindow = "fixed-window",
  SlidingWindow = "sliding-window",
  SlidingWindowCounter = "sliding-window-counter",
  TokenBucket = "token-bucket",
  LeakyBucket = "leaky-bucket",
  GCRA = "gcra",
}

type WindowConfig = {
  /**
   * @description window size in seconds
   */
  window: number;

  /**
   * @description maximum number of requests to be made in the window
   */
  limit: number;
};

export type AlgorithmConfig =
  | ({ name: Algorithm.FixedWindow } & WindowConfig)
  | ({ name: Algorithm.SlidingWindow } & WindowConfig)
  | ({ name: Algorithm.SlidingWindowCounter } & WindowConfig)
  | {
      name: Algorithm.TokenBucket;
      /**
       * @description How many tokens to refill per second
       */
      refillRate: number;
      /**
       * @description maximum number of tokens in the bucket
       */
      capacity: number;
      /**
       * @description number of tokens to be provided initially
       */
      initialTokens?: number;
    }
  | {
      name: Algorithm.LeakyBucket;
      /**
       * @description how many requests to leak per second
       */
      leakRate: number;
      /**
       * @description maximum number of requests in the queue
       */
      capacity: number;
    }
  | {
      name: Algorithm.GCRA;
      /**
       * @description how many requests to leak per second
       */
      interval: number;
      /**
       * @description how many requests can arrive simultaneously or in quick succession
       */
      burst: number;
    }
  | ({ name: string } & Record<string, any>);
