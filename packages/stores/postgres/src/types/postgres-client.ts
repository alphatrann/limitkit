/**
 * Structural row/result shape returned by a `pg`-compatible query call.
 * Deliberately loose (`rows: T[]`) so real `pg.QueryResult` objects satisfy
 * it without a hard dependency on the `pg` package's types.
 */
export interface PostgresQueryResult<T = any> {
  rows: T[];
  rowCount?: number | null;
}

/**
 * Structural type for a single checked-out connection (e.g. `pg.PoolClient`).
 *
 * `PostgresStore` checks out one client per `consume()` call, runs the
 * transaction on it, and always releases it back to the pool.
 */
export interface PostgresPoolClientLike {
  query<T = any>(text: string, values?: any[]): Promise<PostgresQueryResult<T>>;
  release(): void;
}

/**
 * Structural, `pg.Pool`-like type. `PostgresStore` is constructed with one
 * of these (not a bare `Client`) because every `consume()` call needs to
 * check out a connection, run a transaction, and release it back --
 * a single shared `Client` would serialize all requests through one
 * connection.
 */
export interface PostgresPoolLike {
  connect(): Promise<PostgresPoolClientLike>;
  query<T = any>(text: string, values?: any[]): Promise<PostgresQueryResult<T>>;
}
