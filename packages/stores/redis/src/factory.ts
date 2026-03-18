import {
  FixedWindowConfig,
  GCRAConfig,
  LeakyBucketConfig,
  SlidingWindowConfig,
  SlidingWindowCounterConfig,
  TokenBucketConfig,
} from "@limitkit/core";
import {
  RedisFixedWindow,
  RedisGCRA,
  RedisLeakyBucket,
  RedisSlidingWindow,
  RedisSlidingWindowCounter,
  RedisTokenBucket,
} from "./algorithms";

export function fixedWindow(config: Omit<FixedWindowConfig, "name">) {
  return new RedisFixedWindow({ name: "fixed-window", ...config });
}

export function slidingWindow(config: Omit<SlidingWindowConfig, "name">) {
  return new RedisSlidingWindow({
    name: "sliding-window",
    ...config,
  });
}

export function slidingWindowCounter(
  config: Omit<SlidingWindowCounterConfig, "name">,
) {
  return new RedisSlidingWindowCounter({
    name: "sliding-window-counter",
    ...config,
  });
}

export function tokenBucket(config: Omit<TokenBucketConfig, "name">) {
  return new RedisTokenBucket({ name: "token-bucket", ...config });
}

export function leakyBucket(config: Omit<LeakyBucketConfig, "name">) {
  return new RedisLeakyBucket({ name: "leaky-bucket", ...config });
}

export function gcra(config: Omit<GCRAConfig, "name">) {
  return new RedisGCRA({ name: "gcra", ...config });
}
