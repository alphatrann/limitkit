import {
  GCRA,
  GCRAState,
  processGCRA,
  RateLimitRuleResult,
} from '@limitkit/core';
import { PostgresCompatible } from '../types';

/**
 * Postgres implementation of the **GCRA (Generic Cell Rate Algorithm)**.
 *
 * State lives in `gcra_state`, one row per key, locked with
 * `SELECT ... FOR UPDATE` by `PostgresStore`. The reducer itself is the
 * shared {@link processGCRA} kernel function also used by `@limitkit/memory`.
 *
 * @extends GCRA
 * @implements {PostgresCompatible<GCRAState>}
 */
export class PostgresGCRA
  extends GCRA
  implements PostgresCompatible<GCRAState>
{
  readonly table = 'gcra_state';
  readonly selectColumns = 'tat::float8 AS tat';

  toRow(state: GCRAState): Record<string, number> {
    return { tat: state.tat };
  }

  fromRow(row: Record<string, any>): GCRAState {
    return { tat: Number(row.tat) };
  }

  process(
    state: GCRAState | undefined,
    now: number,
    cost: number = 1,
  ): { state: GCRAState; output: RateLimitRuleResult } {
    return processGCRA(this.config, state, now, cost);
  }
}
