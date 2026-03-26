import { RateLimitConfig } from "@limitkit/core";
import { SetMetadata } from "@nestjs/common";
import { RATE_LIMIT_CONFIG_METADATA_KEY } from "../limit.tokens";

/**
 * Apply additional rate limiting rules at the controller or route level.
 *
 * This decorator allows routes or controllers to define extra rate limiting
 * rules that are merged with the global rules configured in `LimitModule`.
 *
 * ## Rule Resolution
 *
 * Rules are resolved using the following precedence:
 *
 * ```
 * Global rules (LimitModule)
 *      ↓
 * Controller rules (@RateLimit on controller)
 *      ↓
 * Route rules (@RateLimit on handler)
 * ```
 *
 * Rules with the same `name` override earlier rules during merging.
 *
 * ## Notes
 *
 * - Only **rules** can be configured at the decorator level.
 * - Infrastructure configuration such as `store` or `debug`
 *   must be defined globally in `LimitModule`.
 *
 * @param config Optional configuration containing additional rate limit rules.
 *
 * @example
 *
 * ```ts
 * @RateLimit({
 *   rules: [
 *     {
 *       name: "per-ip",
 *       key: (req) => "ip:" + req.ip,
 *       policy: new RedisFixedWindow({ name: "fixed-window", window: 60, limit: 100 })
 *     }
 *   ]
 * })
 * @Get("/posts")
 * findPosts() {}
 * ```
 */
export const RateLimit = (config?: Pick<RateLimitConfig, "rules">) =>
  SetMetadata(RATE_LIMIT_CONFIG_METADATA_KEY, config);
