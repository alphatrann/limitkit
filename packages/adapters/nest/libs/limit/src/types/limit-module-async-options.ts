import { RateLimitConfig } from "@limitkit/core";

/**
 * Asynchronous configuration options for registering `LimitModule`.
 *
 * This allows the rate limiter configuration to be created dynamically
 * using injected dependencies (e.g., database services, configuration services).
 *
 * Common use cases include:
 * - Loading Redis connection strings from `ConfigService`
 * - Fetching configuration from external systems
 * - Initializing stores that require async setup
 *
 * @example
 * ```ts
 * LimitModule.forRootAsync({
 *   imports: [ConfigModule],
 *   inject: [ConfigService],
 *   useFactory: async (config: ConfigService) => {
 *     const redis = createClient({ url: config.get("REDIS_URL") });
 *     await redis.connect();
 *
 *     return {
 *       store: new RedisStore(redis),
 *       rules: [...]
 *     };
 *   }
 * })
 * ```
 */
export interface LimitModuleAsyncOptions {
  imports?: any[];
  inject?: any[];
  useFactory: (...args: any[]) => Promise<RateLimitConfig> | RateLimitConfig;
}
