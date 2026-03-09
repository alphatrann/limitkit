/**
 * LimitKit Core - Rate Limiting Library
 *
 * Provides flexible, high-performance rate limiting with support for multiple algorithms
 * and storage backends.
 *
 * ## Quick Start
 *
 * ```typescript
 * import { RateLimiter } from '@limitkit/core';
 * import { MemoryStore } from '@limitkit/memory';
 *
 * const limiter = new RateLimiter({
 *   store: new MemoryStore(),
 *   rules: [
 *     {
 *       name: 'api-limit',
 *       key: (ctx) => ctx.userId,
 *       policy: { name: 'fixed-window', window: 60, limit: 100 }
 *     }
 *   ]
 * });
 *
 * const result = await limiter.consume({ userId: 'user-123' });
 * ```
 *
 * ## Features
 * - Multiple rate limiting algorithms (Fixed Window, Sliding Window, Token Bucket, etc.)
 * - Flexible storage backends (Memory, Redis, etc.)
 * - Dynamic rule configuration (static or context-based)
 * - Request cost weighting
 * - Debug mode for troubleshooting
 * - TypeScript support
 *
 * @packageDocumentation
 */

export * from "./rate-limiter";
export * from "./types";
