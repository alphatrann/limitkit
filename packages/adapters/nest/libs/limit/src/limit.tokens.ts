/**
 * Rate limit config token used when registering the configuration in LimitModule
 */
export const RATE_LIMIT_CONFIG = Symbol("RATE_LIMIT_CONFIG");

/**
 * Metadata key used by the `RateLimit` decorator to store route-level rules.
 *
 * @see RateLimit
 */
export const RATE_LIMIT_CONFIG_METADATA_KEY = "limitkit:config";

/**
 * Metadata key used by the `SkipRateLimit` decorator to bypass rate limiting.
 *
 * @see SkipRateLimit
 */
export const SKIP_RATE_LIMIT_METADATA_KEY = "limitkit:skip";
