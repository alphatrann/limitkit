import {
  processTokenBucket,
  RateLimitRuleResult,
  TokenBucket,
  TokenBucketState,
} from '@limitkit/core';
import { PostgresCompatible } from '../types';

/**
 * Postgres implementation of the **Token Bucket** rate limiting algorithm.
 *
 * State lives in `token_bucket_state`, one row per key, locked with
 * `SELECT ... FOR UPDATE` by `PostgresStore`. The reducer itself is the
 * shared {@link processTokenBucket} kernel function also used by
 * `@limitkit/memory`.
 *
 * @extends TokenBucket
 * @implements {PostgresCompatible<TokenBucketState>}
 */
export class PostgresTokenBucket
  extends TokenBucket
  implements PostgresCompatible<TokenBucketState>
{
  readonly table = 'token_bucket_state';
  readonly selectColumns = 'tokens, last_refill::float8 AS last_refill';

  toRow(state: TokenBucketState): Record<string, number> {
    return { tokens: state.tokens, last_refill: state.lastRefill };
  }

  fromRow(row: Record<string, any>): TokenBucketState {
    return { tokens: Number(row.tokens), lastRefill: Number(row.last_refill) };
  }

  process(
    state: TokenBucketState | undefined,
    now: number,
    cost: number = 1,
  ): { state: TokenBucketState; output: RateLimitRuleResult } {
    return processTokenBucket(this.config, state, now, cost);
  }
}
