import { RateLimiter, mergeRules } from "@limitkit/core";
import { Injectable, CanActivate, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { TooManyRequestsException } from "../exceptions";
import {
  RATE_LIMIT_CONFIG_METADATA_KEY,
  SKIP_RATE_LIMIT_METADATA_KEY,
} from "../limit.tokens";

/**
 * NestJS Guard that enforces rate limiting using the `@limitkit/core` RateLimiter.
 *
 * The guard reads metadata from the `@RateLimit()` and `@SkipRateLimit()` decorators
 * applied at the controller and route handler levels and determines the effective
 * rate limiting rules for the current request.
 *
 * ## Rule Precedence
 *
 * Rate limiting rules are resolved using the following hierarchy:
 *
 * ```
 * Global Rules (configured in LimitModule)
 *        ↓
 * Controller Rules (@RateLimit on controller)
 *        ↓
 * Route Rules (@RateLimit on handler)
 * ```
 *
 * These rules are merged using `mergeRules`, allowing route or controller rules
 * to override global rules with the same name.
 *
 * ## Skip Behavior
 *
 * The `@SkipRateLimit()` decorator can disable rate limiting at different levels:
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
 *
 * ## Response Headers
 *
 * When a request is processed, the guard sets standard rate limit headers
 * based on the evaluation result:
 *
 * - `RateLimit-Limit` — Maximum number of requests allowed in the current window.
 * - `RateLimit-Remaining` — Remaining requests in the current window.
 * - `RateLimit-Reset` — Seconds until the rate limit window resets.
 *
 * If the request exceeds the limit:
 *
 * - `Retry-After` — Seconds the client should wait before making another request.
 *
 * These headers follow the standardized RateLimit header conventions defined
 * in RFC 9331.
 *
 * ## Execution Flow
 *
 * 1. Extract request and response objects from the execution context.
 * 2. Retrieve metadata for:
 *    - handler rules
 *    - controller rules
 *    - handler skip
 *    - controller skip
 * 3. Determine the effective rule set based on precedence and skip rules.
 * 4. Create a temporary `RateLimiter` instance with the resolved rules.
 * 5. Call `consume()` to evaluate the request.
 * 6. Attach rate limit headers to the response.
 * 7. If the request exceeds limits, throw `TooManyRequestsException`.
 *
 * ## Notes
 *
 * - A new `RateLimiter` instance is created per request when route-level rule
 *   overrides are applied. This ensures rule resolution is isolated and does
 *   not mutate the global limiter configuration.
 *
 * - The request object (`req`) is passed directly as the rate limiter context,
 *   allowing rules to dynamically resolve keys, costs, or policies based on
 *   request properties such as IP address, headers, or authenticated user.
 *
 * ## Usage
 *
 * ```ts
 * @Controller()
 * export class PostController {
 *
 *   @RateLimit({
 *     rules: [
 *       {
 *         name: "per-ip",
 *         key: (req) => req.ip,
 *         policy: { name: "fixed-window", window: 60, limit: 100 }
 *       }
 *     ]
 *   })
 *   @Get("/posts")
 *   findPosts() {}
 * }
 * ```
 *
 * @see RateLimiter
 * @see mergeRules
 * @see RateLimit
 * @see SkipRateLimit
 */
@Injectable()
export class LimitGuard implements CanActivate {
  constructor(
    private limiter: RateLimiter,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    const handlerConfig = this.reflector.get(
      RATE_LIMIT_CONFIG_METADATA_KEY,
      context.getHandler(),
    );
    const controllerConfig = this.reflector.get(
      RATE_LIMIT_CONFIG_METADATA_KEY,
      context.getClass(),
    );

    const handlerSkip = this.reflector.get(
      SKIP_RATE_LIMIT_METADATA_KEY,
      context.getHandler(),
    );
    const controllerSkip = this.reflector.get(
      SKIP_RATE_LIMIT_METADATA_KEY,
      context.getClass(),
    );

    if (handlerSkip) return true;

    let rules;

    if (controllerSkip) {
      rules = handlerConfig?.rules ?? [];
    } else {
      rules = mergeRules(this.limiter.config.rules, [
        ...(controllerConfig?.rules ?? []),
        ...(handlerConfig?.rules ?? []),
      ]);
    }

    if (!rules.length) return true;

    const limiter = new RateLimiter({
      ...this.limiter.config,
      ...(controllerConfig ?? {}),
      ...(handlerConfig ?? {}),
      rules,
    });

    const result = await limiter.consume(req);

    res.setHeader("RateLimit-Limit", result.limit);
    res.setHeader("RateLimit-Remaining", result.remaining);
    res.setHeader("RateLimit-Reset", result.reset);

    if (!result.allowed) {
      res.setHeader("Retry-After", result.retryAfter);
      throw new TooManyRequestsException("Too many requests");
    }

    return true;
  }
}
