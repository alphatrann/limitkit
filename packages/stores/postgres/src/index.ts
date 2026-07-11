/**
 * Postgres-based durable rate limiting store for LimitKit.
 *
 * This package provides a Postgres-backed implementation of the LimitKit
 * Store interface using SQL transactions (`SELECT ... FOR UPDATE`) instead
 * of Lua scripts or in-memory maps, enabling durable rate limiting for
 * teams that already run Postgres and don't want to run Redis.
 *
 * @packageDocumentation
 * @example
 * ```typescript
 * import { RateLimiter } from '@limitkit/core';
 * import { PostgresStore, initSchema, fixedWindow } from '@limitkit/postgres';
 * import { Pool } from 'pg';
 *
 * const pool = new Pool();
 * await initSchema(pool);
 *
 * const store = new PostgresStore(pool);
 *
 * const limiter = new RateLimiter({
 *   store,
 *   rules: [{ name: 'api-limit', key: 'global', policy: fixedWindow({ window: 60, limit: 100 }) }],
 * });
 * ```
 */

export * from './postgres-store';
export * from './schema';
export * from './types';
export * from './algorithms';
export * from './factory';
