import {
  IoRedisCompatibleClient,
  NodeRedisCompatibleClient,
  RedisStore,
  fixedWindow,
} from "../src";

describe("RedisStore client compatibility", () => {
  const algorithm = fixedWindow({
    window: 5,
    limit: 10,
  });

  it("supports node-redis clients", async () => {
    const redis: jest.Mocked<NodeRedisCompatibleClient> = {
      scriptLoad: jest.fn().mockResolvedValue("node-sha"),
      evalSha: jest.fn().mockResolvedValue([1, 9, 5_000, 0]),
    };

    const store = new RedisStore(redis);
    const result = await store.consume("user:1", algorithm, 1_000);

    expect(redis.scriptLoad).toHaveBeenCalledWith(algorithm.luaScript);
    expect(redis.evalSha).toHaveBeenCalledWith("node-sha", {
      keys: ["user:1"],
      arguments: ["1000", "5000", "10", "1"],
    });
    expect(result).toEqual({
      allowed: true,
      limit: 10,
      remaining: 9,
      resetAt: 5_000,
      availableAt: undefined,
    });
  });

  it("supports ioredis clients", async () => {
    const redis: jest.Mocked<IoRedisCompatibleClient> = {
      call: jest.fn().mockResolvedValue("io-sha"),
      evalsha: jest.fn().mockResolvedValue(["1", "8", "5000", "0"]),
    };

    const store = new RedisStore(redis);
    const result = await store.consume("user:2", algorithm, 1_000, 2);

    expect(redis.call).toHaveBeenCalledWith(
      "SCRIPT",
      "LOAD",
      algorithm.luaScript,
    );
    expect(redis.evalsha).toHaveBeenCalledWith(
      "io-sha",
      1,
      "user:2",
      "1000",
      "5000",
      "10",
      "2",
    );
    expect(result).toEqual({
      allowed: true,
      limit: 10,
      remaining: 8,
      resetAt: 5_000,
      availableAt: undefined,
    });
  });

  it("reloads node-redis scripts after NOSCRIPT", async () => {
    const redis: jest.Mocked<NodeRedisCompatibleClient> = {
      scriptLoad: jest
        .fn()
        .mockResolvedValueOnce("stale-sha")
        .mockResolvedValueOnce("fresh-sha"),
      evalSha: jest
        .fn()
        .mockRejectedValueOnce(new Error("NOSCRIPT No matching script"))
        .mockResolvedValueOnce([1, 9, 5_000, 0]),
    };

    const store = new RedisStore(redis);
    const result = await store.consume("user:3", algorithm, 1_000);

    expect(redis.scriptLoad).toHaveBeenCalledTimes(2);
    expect(redis.evalSha).toHaveBeenNthCalledWith(1, "stale-sha", {
      keys: ["user:3"],
      arguments: ["1000", "5000", "10", "1"],
    });
    expect(redis.evalSha).toHaveBeenNthCalledWith(2, "fresh-sha", {
      keys: ["user:3"],
      arguments: ["1000", "5000", "10", "1"],
    });
    expect(result.allowed).toBe(true);
  });

  it("reloads ioredis scripts after NOSCRIPT", async () => {
    const redis: jest.Mocked<IoRedisCompatibleClient> = {
      call: jest
        .fn()
        .mockResolvedValueOnce("stale-sha")
        .mockResolvedValueOnce("fresh-sha"),
      evalsha: jest
        .fn()
        .mockRejectedValueOnce(new Error("NOSCRIPT No matching script"))
        .mockResolvedValueOnce([1, 9, 5_000, 0]),
    };

    const store = new RedisStore(redis);
    const result = await store.consume("user:4", algorithm, 1_000);

    expect(redis.call).toHaveBeenCalledTimes(2);
    expect(redis.evalsha).toHaveBeenNthCalledWith(
      1,
      "stale-sha",
      1,
      "user:4",
      "1000",
      "5000",
      "10",
      "1",
    );
    expect(redis.evalsha).toHaveBeenNthCalledWith(
      2,
      "fresh-sha",
      1,
      "user:4",
      "1000",
      "5000",
      "10",
      "1",
    );
    expect(result.allowed).toBe(true);
  });
});
