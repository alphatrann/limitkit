/**
 * Represents a Redis-compatible interface for algorithms
 */
export interface RedisCompatible {
  /**
   * The content of the Lua script
   */
  readonly luaScript: string;

  /**
   * The maximum number of requests that can be made
   */
  get limit(): number;

  /**
   * Get arguments to passed into the Lua script as an array of strings
   * @param now Current Unix timestamp in millisecond
   * @param cost The cost needed to perform a request
   * @param shouldConsume `false` makes the script a pure read (no writes, no
   *   TTL refresh); it is appended to the script's arguments as `"0"`; when `true` (the default)
   *   nothing is appended.
   */
  getLuaArgs(now: number, cost: number, shouldConsume?: boolean): string[];
}
