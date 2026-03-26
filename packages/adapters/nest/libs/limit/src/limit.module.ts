import { Module, DynamicModule } from "@nestjs/common";
import { RateLimitConfig, RateLimiter } from "@limitkit/core";
import { RATE_LIMIT_CONFIG } from "./limit.tokens";
import { LimitGuard } from "./guards/limit.guard";
import { APP_GUARD } from "@nestjs/core";
import { LimitModuleAsyncOptions } from "./types";
import { RateLimit, SkipRateLimit } from "./decorators";

/**
 * NestJS integration module for **LimitKit rate limiting**.
 *
 * This module provides a global rate limiting guard (`LimitGuard`) and integrates
 * LimitKit's algorithm system with NestJS controllers and routes.
 *
 * By default, once the module is registered, `LimitGuard` is applied **globally**
 * to all routes in the application.
 *
 * ## Features
 *
 * - Global request rate limiting via `LimitGuard`
 * - Route-level overrides using `@RateLimit()`
 * - Route exclusions using `@SkipRateLimit()`
 * - Support for all LimitKit algorithms and storage backends
 * - Dynamic rule evaluation based on request context
 *
 * ## Overriding Behavior
 *
 * - Use `@RateLimit()` to override the global rate limit policy for a controller or route.
 * - Use `@SkipRateLimit()` to disable rate limiting for a controller or route.
 *
 * ## Usage
 *
 * ### Registering with In-Memory Store
 *
 * ```ts
 * import { InMemoryStore, InMemoryFixedWindow } from "@limitkit/memory";
 *
 * @Module({
 *   imports: [
 *     LimitModule.forRoot({
 *       rules: [
 *         {
 *           name: "global",
 *           key: "global",
 *           policy: new InMemoryFixedWindow({
 *             name: "fixed-window",
 *             window: 60,
 *             limit: 100
 *           })
 *         }
 *       ],
 *       store: new InMemoryStore(),
 *       debug: false
 *     })
 *   ]
 * })
 * export class AppModule {}
 * ```
 *
 * ### Registering with Redis
 *
 * ```ts
 * import { RedisStore, RedisFixedWindow } from "@limitkit/redis";
 * import { createClient } from "redis";
 *
 * @Module({
 *   imports: [
 *     LimitModule.forRootAsync({
 *       useFactory: async () => {
 *         const redis = createClient();
 *         await redis.connect();
 *
 *         return {
 *           rules: [
 *             {
 *               name: "global",
 *               key: "global",
 *               policy: new RedisFixedWindow({
 *                 name: "fixed-window",
 *                 window: 60,
 *                 limit: 100
 *               })
 *             }
 *           ],
 *           store: new RedisStore(redis),
 *           debug: false
 *         };
 *       }
 *     })
 *   ]
 * })
 * export class AppModule {}
 * ```
 *
 * ## Dependency Injection
 *
 * The module exports `RateLimiter`, which can be injected into services
 * for programmatic rate limiting.
 *
 * ```ts
 * constructor(private limiter: RateLimiter) {}
 * ```
 *
 * @see LimitGuard
 * @see RateLimit
 * @see SkipRateLimit
 */
@Module({})
export class LimitModule {
  /**
   * Register the `LimitModule` with a static configuration.
   *
   * This method initializes the global {@link RateLimiter} instance and
   * automatically applies the {@link LimitGuard} as a global guard
   * to enforce rate limiting on all routes.
   *
   * Controller and route-level rules can be added or overridden using
   * the {@link RateLimit} and {@link SkipRateLimit} decorators.
   *
   * Use this method when the rate limit configuration is known at
   * application startup and does not require dependency injection.
   *
   * @param config Global rate limiting configuration.
   *
   * @returns A NestJS {@link DynamicModule} that provides:
   * - the configured {@link RateLimiter}
   * - the global {@link LimitGuard}
   *
   * @example
   *
   * ```ts
   * @Module({
   *   imports: [
   *     LimitModule.forRoot({
   *       store: new InMemoryStore(),
   *
   *       rules: [
   *         {
   *           name: "global",
   *           key: (req) => "ip:" + req.ip,
   *           policy: new InMemoryFixedWindow({ name: "fixed-window", window: 60, limit: 100 })
   *         }
   *       ]
   *     })
   *   ]
   * })
   * export class AppModule {}
   * ```
   */
  static forRoot(config: RateLimitConfig): DynamicModule {
    return {
      module: LimitModule,
      providers: [
        {
          provide: RATE_LIMIT_CONFIG,
          useValue: config,
        },
        {
          provide: RateLimiter,
          inject: [RATE_LIMIT_CONFIG],
          useFactory: (config: RateLimitConfig) => new RateLimiter(config),
        },
        {
          provide: APP_GUARD,
          useClass: LimitGuard,
        },
      ],
      exports: [RateLimiter],
    };
  }

  /**
   * Register the `LimitModule` using an asynchronous configuration factory.
   *
   * This method is useful when the rate limiter configuration depends on
   * other providers (e.g., `ConfigService`, database services, or external APIs).
   *
   * The factory function receives injected dependencies and must return
   * a {@link RateLimitConfig} object.
   *
   * The module will create a global {@link RateLimiter} instance and apply
   * the {@link LimitGuard} globally to all routes.
   *
   * @param options Asynchronous module configuration options.
   *
   * @returns A NestJS {@link DynamicModule} configured with the resolved
   * rate limit configuration.
   *
   * @example
   *
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
   *       debug: config.get("NODE_ENV") === "development",
   *       rules: [...]
   *     };
   *   }
   * })
   * ```
   */
  static forRootAsync(options: LimitModuleAsyncOptions): DynamicModule {
    return {
      module: LimitModule,
      imports: options.imports ?? [],
      providers: [
        {
          provide: RATE_LIMIT_CONFIG,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
        {
          provide: RateLimiter,
          inject: [RATE_LIMIT_CONFIG],
          useFactory: (config: RateLimitConfig) => new RateLimiter(config),
        },
        {
          provide: APP_GUARD,
          useClass: LimitGuard,
        },
      ],
      exports: [RateLimiter],
    };
  }
}
