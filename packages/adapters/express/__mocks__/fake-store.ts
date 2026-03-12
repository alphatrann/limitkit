import { FixedWindowConfig, Store } from "@limitkit/core";

/**
 * Simplied implementation of in-memory store + fixed window for e2e testing between Express Adapter, RateLimiter and Store
 */
export class FakeStore implements Store {
  private counters = new Map<string, number>();

  async consume(key: string, config: FixedWindowConfig, cost: number) {
    const current = this.counters.get(key) ?? 0;
    const next = current + cost;

    this.counters.set(key, next);

    const allowed = next <= config.limit;

    return {
      allowed,
      limit: config.limit,
      remaining: Math.max(config.limit - next, 0),
      reset: config.window ?? 60,
      retryAfter: allowed ? undefined : (config.window ?? 60),
    };
  }
}
