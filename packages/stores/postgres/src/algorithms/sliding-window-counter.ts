import {
  processSlidingWindowCounter,
  RateLimitRuleResult,
  SlidingWindowCounter,
  SlidingWindowCounterState,
} from "@limitkit/core";
import { PostgresCompatible } from "../types";

/**
 * Postgres implementation of the **Sliding Window Counter** algorithm.
 *
 * State lives in `sliding_window_counter_state`, one row per key, locked
 * with `SELECT ... FOR UPDATE` by `PostgresStore`. The reducer itself is
 * the shared {@link processSlidingWindowCounter} kernel function also used
 * by `@limitkit/memory`.
 *
 * @extends SlidingWindowCounter
 * @implements {PostgresCompatible<SlidingWindowCounterState>}
 */
export class PostgresSlidingWindowCounter
  extends SlidingWindowCounter
  implements PostgresCompatible<SlidingWindowCounterState>
{
  readonly table = "sliding_window_counter_state";
  readonly selectColumns =
    "count, prev_count, window_start::float8 AS window_start";

  toRow(state: SlidingWindowCounterState): Record<string, number> {
    return {
      count: state.count,
      prev_count: state.prevCount,
      window_start: state.windowStart,
    };
  }

  fromRow(row: Record<string, any>): SlidingWindowCounterState {
    return {
      count: Number(row.count),
      prevCount: Number(row.prev_count),
      windowStart: Number(row.window_start),
    };
  }

  process(
    state: SlidingWindowCounterState | undefined,
    now: number,
    cost: number = 1,
  ): { state: SlidingWindowCounterState; output: RateLimitRuleResult } {
    return processSlidingWindowCounter(this.config, state, now, cost);
  }
}
