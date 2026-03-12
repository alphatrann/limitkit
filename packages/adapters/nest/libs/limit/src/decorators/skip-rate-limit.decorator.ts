import { SetMetadata } from "@nestjs/common";
import { SKIP_RATE_LIMIT_METADATA_KEY } from "../limit.tokens";

/**
 * Disable rate limiting at controller or route level
 * ## Behavior
 *
 * - **Handler Skip**
 *   - Completely bypasses rate limiting for that route.
 *   - No rules are evaluated.
 *
 * - **Controller Skip**
 *   - Disables global and controller rules.
 *   - Route-level rules may still apply if defined.
 *
 * Example:
 *
 * ```ts
 * @SkipRateLimit()
 * @Controller('posts')
 * class PostController {
 *
 *   // No rate limiting applied
 *   @Get()
 *   findAll() {}
 *
 *   // Route rule overrides controller skip
 *   @RateLimit({ rules: [...] })
 *   @Get('search')
 *   search() {}
 * }
 * ```
 */
export const SkipRateLimit = () =>
  SetMetadata(SKIP_RATE_LIMIT_METADATA_KEY, true);
