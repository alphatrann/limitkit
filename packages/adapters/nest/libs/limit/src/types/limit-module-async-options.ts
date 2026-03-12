import { RateLimitConfig } from "@limitkit/core";

export interface LimitModuleAsyncOptions {
  imports?: any[];
  inject?: any[];
  useFactory: (...args: any[]) => Promise<RateLimitConfig> | RateLimitConfig;
}
