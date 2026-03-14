/**
 * LimitKit Memory - In-memory storage for rate limiting
 *
 * Provides in-memory storage backend with JavaScript `Map`.
 *
 * ## Quick Start
 *
 * ```typescript
 * import { RateLimiter } from '@limitkit/core';
 * import { InMemoryStore } from '@limitkit/memory';
 *
 * const limiter = new RateLimiter({
 *   store: new InMemoryStore(),
 *   rules: [
 *     {
 *       name: 'api-limit',
 *       key: (ctx) => ctx.userId,
 *       policy: new InMemoryFixedWindow({ name: 'fixed-window', window: 60, limit: 100 })
 *     }
 *   ]
 * });
 *
 * const result = await limiter.consume({ userId: 'user-123' });
 * ```
 * @warning In production, dedicated storage backends such as Redis should be used over memory.
 * @packageDocumentation
 */
export * from "./algorithms";
export * from "./types";
export * from "./in-memory-store";
