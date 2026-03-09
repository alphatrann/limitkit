import { RateLimitResult } from "./rate-limit-result";

export interface Limiter<C> {
  consume(ctx: C): Promise<RateLimitResult>;
}
