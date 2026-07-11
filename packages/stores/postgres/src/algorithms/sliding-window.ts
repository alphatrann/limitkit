import {
  BadArgumentsException,
  RateLimitRuleResult,
  SlidingWindow,
} from "@limitkit/core";
import { PostgresLogCompatible, PostgresPoolClientLike } from "../types";

/**
 * Postgres implementation of the **Sliding Window** rate limiting algorithm.
 *
 * Unlike the other algorithms, Sliding Window's in-memory circular buffer
 * and Postgres's row-per-request log are fundamentally different storage
 * models with nothing to share, so this implementation is bespoke rather
 * than a thin wrapper around a shared `@limitkit/core` kernel function.
 *
 * State lives in `sliding_window_log`, one row per accepted request. The
 * anchor row's own upsert-lock (taken by `PostgresStore` before dispatching
 * here) doubles as the mutex, since there's no single child row to lock.
 *
 * Per call: expire rows older than the window, `SUM(cost)` the remainder,
 * decide allow/reject, and insert a new row only if allowed.
 *
 * @extends SlidingWindow
 * @implements {PostgresLogCompatible}
 */
export class PostgresSlidingWindow
  extends SlidingWindow
  implements PostgresLogCompatible
{
  readonly logTable = "sliding_window_log";

  async processLog(
    client: PostgresPoolClientLike,
    table: string,
    stateId: number,
    now: number,
    cost: number = 1,
  ): Promise<RateLimitRuleResult> {
    if (cost > this.config.limit)
      throw new BadArgumentsException(
        `Cost must never exceed config.limit, (cost=${cost}, config.limit=${this.config.limit})`,
      );

    const limit = this.config.limit;
    const windowMs = this.config.window * 1000;
    const cutoff = now - windowMs;

    await client.query(
      `DELETE FROM ${table} WHERE state_id = $1 AND request_at < $2`,
      [stateId, cutoff],
    );

    const agg = await client.query<{
      total: number;
      oldest: number | null;
      newest: number | null;
    }>(
      `SELECT COALESCE(SUM(cost), 0)::float8 AS total,
              MIN(request_at)::float8 AS oldest,
              MAX(request_at)::float8 AS newest
       FROM ${table} WHERE state_id = $1`,
      [stateId],
    );

    const { total, oldest, newest } = agg.rows[0];
    const currentTotal = Number(total);

    if (currentTotal + cost > limit) {
      const resetAt = (newest !== null ? Number(newest) : now) + windowMs;
      const availableAt = (oldest !== null ? Number(oldest) : now) + windowMs;
      return {
        allowed: false,
        limit,
        remaining: 0,
        resetAt,
        availableAt,
      };
    }

    await client.query(
      `INSERT INTO ${table} (state_id, request_at, cost) VALUES ($1, $2, $3)`,
      [stateId, now, cost],
    );

    const remaining = limit - (currentTotal + cost);
    const resetAt = now + windowMs;

    return { allowed: true, limit, remaining, resetAt };
  }
}
