-- LimitKit Postgres store schema
-- Canonical DDL, source of truth for @limitkit/postgres.
--
-- Safe to run multiple times (idempotent): every statement uses
-- IF NOT EXISTS. Teams with their own migration tooling (Flyway,
-- node-pg-migrate, Prisma migrate, ...) can point their runner at this
-- file directly; `initSchema()` runs the same statements for quick
-- starts, local dev, and tests.

CREATE SCHEMA IF NOT EXISTS limitkit;

-- Anchor table: doubles as the kv-pair registry and the "base class" row
-- that every per-algorithm child table foreign-keys into. No JSONB here,
-- so the hot path of every built-in algorithm never touches JSONB.
CREATE TABLE IF NOT EXISTS limitkit.rate_limit_state (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key          TEXT NOT NULL UNIQUE,
  algorithm    TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rate_limit_state_updated_at_idx
  ON limitkit.rate_limit_state (updated_at);

-- Per-algorithm child tables: state_id is both PK and FK to the anchor
-- row, cascading deletes so pruning the anchor row cleans up state too.

CREATE TABLE IF NOT EXISTS limitkit.token_bucket_state (
  state_id     BIGINT PRIMARY KEY REFERENCES limitkit.rate_limit_state (id) ON DELETE CASCADE,
  tokens       DOUBLE PRECISION NOT NULL,
  last_refill  BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS limitkit.fixed_window_state (
  state_id     BIGINT PRIMARY KEY REFERENCES limitkit.rate_limit_state (id) ON DELETE CASCADE,
  count        INTEGER NOT NULL,
  window_start BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS limitkit.sliding_window_counter_state (
  state_id     BIGINT PRIMARY KEY REFERENCES limitkit.rate_limit_state (id) ON DELETE CASCADE,
  count        INTEGER NOT NULL,
  prev_count   INTEGER NOT NULL,
  window_start BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS limitkit.leaky_bucket_state (
  state_id     BIGINT PRIMARY KEY REFERENCES limitkit.rate_limit_state (id) ON DELETE CASCADE,
  queue_size   DOUBLE PRECISION NOT NULL,
  last_leak    BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS limitkit.shaping_leaky_bucket_state (
  state_id     BIGINT PRIMARY KEY REFERENCES limitkit.rate_limit_state (id) ON DELETE CASCADE,
  next_free_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS limitkit.gcra_state (
  state_id     BIGINT PRIMARY KEY REFERENCES limitkit.rate_limit_state (id) ON DELETE CASCADE,
  tat          BIGINT NOT NULL
);

-- Row-per-request log backing the (bespoke, non-kernel) sliding-window
-- algorithm. Not a 1:1 child of the anchor row -- multiple rows per key.
CREATE TABLE IF NOT EXISTS limitkit.sliding_window_log (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  state_id     BIGINT NOT NULL REFERENCES limitkit.rate_limit_state (id) ON DELETE CASCADE,
  request_at   BIGINT NOT NULL,
  cost         INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS sliding_window_log_state_id_request_at_idx
  ON limitkit.sliding_window_log (state_id, request_at);

-- Fallback state table for user-authored custom algorithms only.
-- No built-in algorithm uses this table.
CREATE TABLE IF NOT EXISTS limitkit.custom_state (
  state_id     BIGINT PRIMARY KEY REFERENCES limitkit.rate_limit_state (id) ON DELETE CASCADE,
  value        JSONB NOT NULL
);
