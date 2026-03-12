import { Module, DynamicModule } from "@nestjs/common";
import { RateLimitConfig, RateLimiter } from "@limitkit/core";
import { RATE_LIMIT_CONFIG } from "./limit.tokens";
import { LimitGuard } from "./guards/limit.guard";
import { APP_GUARD } from "@nestjs/core";
import { LimitModuleAsyncOptions } from "./types";

@Module({})
export class LimitModule {
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
