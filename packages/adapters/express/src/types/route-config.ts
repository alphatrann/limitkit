import { RateLimitConfig } from "@limitkit/core";
import { Request } from "express";

export interface RouteRateLimitConfig extends Partial<
  RateLimitConfig<Request>
> {
  rateLimitResponse?: Record<string, any>;
}
