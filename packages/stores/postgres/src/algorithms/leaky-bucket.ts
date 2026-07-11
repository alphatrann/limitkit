import {
  LeakyBucket,
  LeakyBucketState,
  processLeakyBucket,
  RateLimitRuleResult,
} from '@limitkit/core';
import { PostgresCompatible } from '../types';

/**
 * Postgres implementation of the **Policing Leaky Bucket** rate limiting algorithm.
 *
 * State lives in `leaky_bucket_state`, one row per key, locked with
 * `SELECT ... FOR UPDATE` by `PostgresStore`. The reducer itself is the
 * shared {@link processLeakyBucket} kernel function also used by
 * `@limitkit/memory`.
 *
 * @extends LeakyBucket
 * @implements {PostgresCompatible<LeakyBucketState>}
 */
export class PostgresLeakyBucket
  extends LeakyBucket
  implements PostgresCompatible<LeakyBucketState>
{
  readonly table = 'leaky_bucket_state';
  readonly selectColumns = 'queue_size, last_leak::float8 AS last_leak';

  toRow(state: LeakyBucketState): Record<string, number> {
    return { queue_size: state.queueSize, last_leak: state.lastLeak };
  }

  fromRow(row: Record<string, any>): LeakyBucketState {
    return {
      queueSize: Number(row.queue_size),
      lastLeak: Number(row.last_leak),
    };
  }

  process(
    state: LeakyBucketState | undefined,
    now: number,
    cost: number = 1,
  ): { state: LeakyBucketState; output: RateLimitRuleResult } {
    return processLeakyBucket(this.config, state, now, cost);
  }
}
