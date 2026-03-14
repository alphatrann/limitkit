import { RateLimitConfig } from "@limitkit/core";
import { SetMetadata } from "@nestjs/common";
import { RATE_LIMIT_CONFIG_METADATA_KEY } from "../limit.tokens";

/**
 * Enforce rate limiting at controller or route level
 *
 * ## Behavior
 *   - Handler rules override controller and global rules if the names match
 *   - Rules are executed from left to right in the array
 *   - Execution order: global rules -> controller rules -> route rules
 *
 * Example:
 *
 * ```ts
 * @RateLimit({...}) // define controller-level config
 * @Controller('posts')
 * class PostController {
 *
 *   // Route rules overrides controller rules
 *   @RateLimit({...})
 *   @Get('search')
 *   search() {}
 * }
 * ```
 */
export const RateLimit = (config?: Pick<RateLimitConfig, "rules">) =>
  SetMetadata(RATE_LIMIT_CONFIG_METADATA_KEY, config);
