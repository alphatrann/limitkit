import { RateLimit, SkipRateLimit } from "./decorators";

/**
 * Rate limit config token used when registering the configuration in LimitModule
 */
export const RATE_LIMIT_CONFIG = Symbol("RATE_LIMIT_CONFIG");

/**
 * Rate limit config metadata key in RateLimit decorator
 * @see RateLimit
 */
export const RATE_LIMIT_CONFIG_METADATA_KEY = "limitkit:config";

/**
 * Skip rate limit config metadata key in RateLimit decorator
 * @see SkipRateLimit
 */
export const SKIP_RATE_LIMIT_METADATA_KEY = "limitkit:skip";
