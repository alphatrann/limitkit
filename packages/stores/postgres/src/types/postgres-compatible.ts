import { RateLimitRuleResult } from "@limitkit/core";
import { PostgresPoolClientLike } from "./postgres-client";

/**
 * Contract for algorithms whose state is a single row in a per-algorithm
 * child table keyed by `state_id` (the anchor row's id).
 *
 * `PostgresStore` drives the shared transaction protocol generically for
 * every algorithm implementing this interface:
 *
 * 1. Upsert + lock the anchor row (`rate_limit_state`).
 * 2. `SELECT ... FOR UPDATE` the child row (via `table` + `selectColumns`).
 * 3. Run the pure `process()` reducer (imported from `@limitkit/core`'s
 *    shared kernel, so behavior matches `@limitkit/memory` exactly).
 * 4. Upsert the child row (via `toRow()`).
 * 5. Commit.
 */
export interface PostgresCompatible<TState> {
  /**
   * Unqualified child table name (e.g. `"token_bucket_state"`). The store
   * prefixes this with the configured schema.
   */
  readonly table: string;

  /**
   * Column list for the `SELECT ... FOR UPDATE` query, with any BIGINT
   * columns cast to `float8` (e.g. `"tokens, last_refill::float8 AS last_refill"`)
   * so `pg`'s default type parser returns them as JS numbers without
   * mutating `pg.types`'s global type-parser registry.
   */
  readonly selectColumns: string;

  /**
   * Maps in-memory state to a flat column -> value object for the upsert.
   */
  toRow(state: TState): Record<string, number>;

  /**
   * Maps a raw query result row back to in-memory state.
   */
  fromRow(row: Record<string, any>): TState;

  /**
   * Pure reducer -- same shape as `InMemoryCompatible.process()`, and for
   * every built-in algorithm delegates to the matching shared kernel
   * function in `@limitkit/core`.
   */
  process(
    state: TState | undefined,
    now: number,
    cost?: number,
  ): { state: TState; output: RateLimitRuleResult };
}

/**
 * Contract for algorithms backed by the row-per-request `sliding_window_log`
 * table instead of a single child row. Distinct from {@link PostgresCompatible}
 * because there is no fixed row to upsert -- the algorithm expires rows,
 * aggregates cost, and conditionally inserts a new row within the same
 * transaction, using the anchor row as its mutex.
 */
export interface PostgresLogCompatible {
  /**
   * Unqualified log table name (currently always `"sliding_window_log"`).
   */
  readonly logTable: string;

  /**
   * Runs the algorithm's logic against the row-per-request log.
   *
   * @param client Pooled client already inside the store's transaction.
   * @param table Schema-qualified log table name.
   * @param stateId Anchor row id (already locked by the store's upsert).
   * @param now Current Unix timestamp in milliseconds.
   * @param cost Cost of this request.
   */
  processLog(
    client: PostgresPoolClientLike,
    table: string,
    stateId: number,
    now: number,
    cost: number,
  ): Promise<RateLimitRuleResult>;
}

export function isPostgresLogCompatible(
  algorithm: unknown,
): algorithm is PostgresLogCompatible {
  return (
    !!algorithm &&
    typeof (algorithm as PostgresLogCompatible).processLog === "function"
  );
}
