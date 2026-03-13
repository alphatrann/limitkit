/**
 * Redis-based distributed rate limiting store for LimitKit.
 *
 * This package provides a Redis-backed implementation of the LimitKit Store interface,
 * enabling distributed rate limiting across multiple servers. It uses Lua scripts to
 * ensure atomic operations and supports multiple rate limiting algorithms.
 *
 * @packageDocumentation
 * @example
 * ```typescript
 * import { RedisStore } from '@limitkit/redis';
 * import { RateLimiter } from '@limitkit/core';
 * import { createClient } from 'redis';
 *
 * const redis = createClient();
 * await redis.connect();
 *
 * const store = new RedisStore(redis);
 * await store.init();
 *
 * const limiter = new RateLimiter(store);
 * ```
 */

export * from "./redis-store";
