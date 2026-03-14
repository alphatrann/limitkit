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
   */
  getLuaArgs(now: number, cost: number): string[];
}
