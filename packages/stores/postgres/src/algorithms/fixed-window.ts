import {
  FixedWindow,
  FixedWindowState,
  processFixedWindow,
  RateLimitRuleResult,
} from "@limitkit/core";
import { PostgresCompatible } from "../types";

/**
 * Postgres implementation of the **Fixed Window** rate limiting algorithm.
 *
 * State lives in `fixed_window_state`, one row per key, locked with
 * `SELECT ... FOR UPDATE` by `PostgresStore`. The reducer itself is the
 * shared {@link processFixedWindow} kernel function also used by
 * `@limitkit/memory`.
 *
 * @extends FixedWindow
 * @implements {PostgresCompatible<FixedWindowState>}
 */
export class PostgresFixedWindow
  extends FixedWindow
  implements PostgresCompatible<FixedWindowState>
{
  readonly table = "fixed_window_state";
  readonly selectColumns = "count, window_start::float8 AS window_start";

  toRow(state: FixedWindowState): Record<string, number> {
    return { count: state.count, window_start: state.windowStart };
  }

  fromRow(row: Record<string, any>): FixedWindowState {
    return { count: Number(row.count), windowStart: Number(row.window_start) };
  }

  process(
    state: FixedWindowState | undefined,
    now: number,
    cost: number = 1,
  ): { state: FixedWindowState; output: RateLimitRuleResult } {
    return processFixedWindow(this.config, state, now, cost);
  }
}
