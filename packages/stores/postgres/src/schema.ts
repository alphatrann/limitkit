import { BadArgumentsException } from '@limitkit/core';
import { PostgresPoolLike } from './types';

/**
 * Identifiers cannot be parameterized in Postgres, so any schema name that
 * gets interpolated into DDL/DML must be validated against a strict
 * allowlist first. This is the injection guard for the one place this
 * package interpolates a string into SQL -- every other value always goes
 * through `$1`/`$2` placeholders.
 */
const SCHEMA_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function assertValidSchemaName(schema: string): void {
  if (!SCHEMA_NAME_PATTERN.test(schema)) {
    throw new BadArgumentsException(
      `Invalid schema name "${schema}". Schema names must match ${SCHEMA_NAME_PATTERN}.`,
    );
  }
}

function buildInitSql(schema: string): string {
  return `
    CREATE SCHEMA IF NOT EXISTS "${schema}";

    CREATE TABLE IF NOT EXISTS "${schema}".rate_limit_state (
      id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      key          TEXT NOT NULL UNIQUE,
      algorithm    TEXT NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS rate_limit_state_updated_at_idx
      ON "${schema}".rate_limit_state (updated_at);

    CREATE TABLE IF NOT EXISTS "${schema}".token_bucket_state (
      state_id     BIGINT PRIMARY KEY REFERENCES "${schema}".rate_limit_state (id) ON DELETE CASCADE,
      tokens       DOUBLE PRECISION NOT NULL,
      last_refill  BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "${schema}".fixed_window_state (
      state_id     BIGINT PRIMARY KEY REFERENCES "${schema}".rate_limit_state (id) ON DELETE CASCADE,
      count        INTEGER NOT NULL,
      window_start BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "${schema}".sliding_window_counter_state (
      state_id     BIGINT PRIMARY KEY REFERENCES "${schema}".rate_limit_state (id) ON DELETE CASCADE,
      count        INTEGER NOT NULL,
      prev_count   INTEGER NOT NULL,
      window_start BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "${schema}".leaky_bucket_state (
      state_id     BIGINT PRIMARY KEY REFERENCES "${schema}".rate_limit_state (id) ON DELETE CASCADE,
      queue_size   DOUBLE PRECISION NOT NULL,
      last_leak    BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "${schema}".shaping_leaky_bucket_state (
      state_id     BIGINT PRIMARY KEY REFERENCES "${schema}".rate_limit_state (id) ON DELETE CASCADE,
      next_free_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "${schema}".gcra_state (
      state_id     BIGINT PRIMARY KEY REFERENCES "${schema}".rate_limit_state (id) ON DELETE CASCADE,
      tat          BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "${schema}".sliding_window_log (
      id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      state_id     BIGINT NOT NULL REFERENCES "${schema}".rate_limit_state (id) ON DELETE CASCADE,
      request_at   BIGINT NOT NULL,
      cost         INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS sliding_window_log_state_id_request_at_idx
      ON "${schema}".sliding_window_log (state_id, request_at);

    CREATE TABLE IF NOT EXISTS "${schema}".custom_state (
      state_id     BIGINT PRIMARY KEY REFERENCES "${schema}".rate_limit_state (id) ON DELETE CASCADE,
      value        JSONB NOT NULL
    );
  `;
}

/**
 * Idempotently creates the `@limitkit/postgres` schema and tables.
 *
 * Convenience for quick starts, local dev, and tests -- mirrors
 * `sql/001_init.sql`. Production users should prefer their own migration
 * pipeline (Flyway, node-pg-migrate, Prisma migrate, ...) pointed at that
 * file instead.
 *
 * Safe to call multiple times.
 */
export async function initSchema(
  pool: PostgresPoolLike,
  schema: string = 'limitkit',
): Promise<void> {
  assertValidSchemaName(schema);
  await pool.query(buildInitSql(schema));
}

/**
 * Deletes anchor rows (and, via `ON DELETE CASCADE`, their child rows)
 * that haven't been updated in more than `olderThanMs`.
 *
 * Postgres has no per-row TTL the way Redis does, so idle keys -- or keys
 * orphaned by a rule's config changing, since `addConfigToKey` mints a new
 * key string per config hash -- accumulate forever otherwise. Not run
 * automatically by the library; wire this into your own cron/`pg_cron`/
 * scheduled job.
 *
 * @returns The number of anchor rows deleted.
 */
export async function pruneOlderThan(
  pool: PostgresPoolLike,
  olderThanMs: number,
  schema: string = 'limitkit',
): Promise<number> {
  assertValidSchemaName(schema);
  const cutoff = Date.now() - olderThanMs;
  const result = await pool.query(
    `DELETE FROM "${schema}".rate_limit_state WHERE updated_at < to_timestamp($1 / 1000.0)`,
    [cutoff],
  );
  return result.rowCount ?? 0;
}
