import {
  Algorithm,
  AlgorithmConfig,
  RateLimitRuleResult,
  Store,
} from '@limitkit/core';
import { assertValidSchemaName } from './schema';
import {
  isPostgresLogCompatible,
  PostgresCompatible,
  PostgresLogCompatible,
  PostgresPoolLike,
} from './types';

/**
 * Postgres-based implementation of the Store interface.
 *
 * Provides durable, SQL-transaction-backed rate limiting using Postgres as
 * the shared state backend. Every row-state algorithm (Fixed Window,
 * Sliding Window Counter, Token Bucket, Leaky Bucket, Shaping Leaky Bucket,
 * GCRA) shares one execution path parameterized by the `PostgresCompatible`
 * contract each algorithm implements; Sliding Window uses a bespoke
 * row-per-request log instead (see `PostgresLogCompatible`).
 *
 * ## Transaction protocol
 *
 * Per `consume()` call, within a single transaction on one pooled client,
 * at the default `READ COMMITTED` isolation level:
 *
 * 1. `INSERT ... ON CONFLICT (key) DO UPDATE ... RETURNING id` -- creates
 *    or locks the anchor row (`rate_limit_state`) and returns its id.
 * 2. `SELECT ... FOR UPDATE` -- locks the per-algorithm child row if it
 *    exists (absent on first request for this key).
 * 3. Runs the algorithm's pure `process()` reducer (shared with
 *    `@limitkit/memory` via `@limitkit/core`'s kernel).
 * 4. `INSERT ... ON CONFLICT (state_id) DO UPDATE` -- persists the new
 *    state.
 * 5. Commit, release the client, return the result.
 *
 * Each transaction locks exactly one row (the anchor row's own UPDATE lock
 * doubles as the mutex for Sliding Window's log-based path), so there is no
 * cross-key invariant to protect and no deadlock risk -- as long as that
 * single-row-lock invariant holds for any future algorithm added here.
 *
 * ## Pool-sizing caveat
 *
 * A `FOR UPDATE` transaction holds a pooled connection for the full
 * round-trip on that key. For a very hot single key (e.g. a global rate
 * limit under heavy traffic), this can serialize requests through
 * pool-connection contention in a way Redis's single Lua round-trip
 * doesn't. Size your pool accordingly; this is inherent to the
 * transactional approach, not a bug to fix.
 *
 * @implements {Store}
 */
export class PostgresStore implements Store {
  private readonly schema: string;

  /**
   * @param pool A `pg.Pool`-like connection pool.
   * @param schema Schema name to use (default `"limitkit"`). Validated
   * against a strict identifier allowlist at construction time, since
   * Postgres doesn't support parameterized identifiers.
   */
  constructor(
    private readonly pool: PostgresPoolLike,
    schema: string = 'limitkit',
  ) {
    assertValidSchemaName(schema);
    this.schema = schema;
  }

  async consume<TConfig extends AlgorithmConfig>(
    key: string,
    algorithm: Algorithm<TConfig> &
      (PostgresCompatible<any> | PostgresLogCompatible),
    now: number,
    cost: number = 1,
  ): Promise<RateLimitRuleResult> {
    algorithm.validate();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const anchor = await client.query<{ id: number | string }>(
        `INSERT INTO "${this.schema}".rate_limit_state (key, algorithm)
         VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET updated_at = now()
         RETURNING id`,
        [key, algorithm.config.name],
      );
      const stateId = Number(anchor.rows[0].id);

      let output: RateLimitRuleResult;
      if (isPostgresLogCompatible(algorithm)) {
        const table = `"${this.schema}".${algorithm.logTable}`;
        output = await algorithm.processLog(client, table, stateId, now, cost);
      } else {
        output = await this.consumeRowState(
          client,
          stateId,
          algorithm,
          now,
          cost,
        );
      }

      await client.query('COMMIT');
      return output;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  private async consumeRowState<TState>(
    client: Awaited<ReturnType<PostgresPoolLike['connect']>>,
    stateId: number,
    algorithm: PostgresCompatible<TState>,
    now: number,
    cost: number,
  ): Promise<RateLimitRuleResult> {
    const table = `"${this.schema}".${algorithm.table}`;

    const existing = await client.query<Record<string, any>>(
      `SELECT ${algorithm.selectColumns} FROM ${table} WHERE state_id = $1 FOR UPDATE`,
      [stateId],
    );
    const prevState = existing.rows[0]
      ? algorithm.fromRow(existing.rows[0])
      : undefined;

    const { state: nextState, output } = algorithm.process(
      prevState,
      now,
      cost,
    );

    const row = algorithm.toRow(nextState);
    const columns = Object.keys(row);
    const values = columns.map((column) => row[column]);
    const insertPlaceholders = columns.map((_, i) => `$${i + 2}`).join(', ');
    const updateSet = columns
      .map((column) => `${column} = EXCLUDED.${column}`)
      .join(', ');

    await client.query(
      `INSERT INTO ${table} (state_id, ${columns.join(', ')})
       VALUES ($1, ${insertPlaceholders})
       ON CONFLICT (state_id) DO UPDATE SET ${updateSet}`,
      [stateId, ...values],
    );

    return output;
  }
}
