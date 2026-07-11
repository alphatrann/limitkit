import {
  LeakyBucket,
  processShapingLeakyBucket,
  RateLimitRuleResult,
  ShapingLeakyBucketState,
} from "@limitkit/core";
import { PostgresCompatible } from "../types";

/**
 * Postgres implementation of the **Shaping Leaky Bucket** (traffic shaping) algorithm.
 *
 * State lives in `shaping_leaky_bucket_state`, one row per key, locked with
 * `SELECT ... FOR UPDATE` by `PostgresStore`. The reducer itself is the
 * shared {@link processShapingLeakyBucket} kernel function also used by
 * `@limitkit/memory`.
 *
 * @extends LeakyBucket
 * @implements {PostgresCompatible<ShapingLeakyBucketState>}
 */
export class PostgresShapingLeakyBucket
  extends LeakyBucket
  implements PostgresCompatible<ShapingLeakyBucketState>
{
  readonly table = "shaping_leaky_bucket_state";
  readonly selectColumns = "next_free_at::float8 AS next_free_at";

  toRow(state: ShapingLeakyBucketState): Record<string, number> {
    return { next_free_at: state.nextFreeAt };
  }

  fromRow(row: Record<string, any>): ShapingLeakyBucketState {
    return { nextFreeAt: Number(row.next_free_at) };
  }

  process(
    state: ShapingLeakyBucketState | undefined,
    now: number,
    cost: number = 1,
  ): { state: ShapingLeakyBucketState; output: RateLimitRuleResult } {
    return processShapingLeakyBucket(this.config, state, now, cost);
  }
}
