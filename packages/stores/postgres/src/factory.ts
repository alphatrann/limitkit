import {
  FixedWindowConfig,
  GCRAConfig,
  LeakyBucketConfig,
  SlidingWindowConfig,
  SlidingWindowCounterConfig,
  TokenBucketConfig,
} from "@limitkit/core";
import {
  PostgresFixedWindow,
  PostgresGCRA,
  PostgresLeakyBucket,
  PostgresShapingLeakyBucket,
  PostgresSlidingWindow,
  PostgresSlidingWindowCounter,
  PostgresTokenBucket,
} from "./algorithms";

export function fixedWindow(config: Omit<FixedWindowConfig, "name">) {
  return new PostgresFixedWindow({ name: "fixed-window", ...config });
}

export function slidingWindow(config: Omit<SlidingWindowConfig, "name">) {
  return new PostgresSlidingWindow({
    name: "sliding-window",
    ...config,
  });
}

export function slidingWindowCounter(
  config: Omit<SlidingWindowCounterConfig, "name">,
) {
  return new PostgresSlidingWindowCounter({
    name: "sliding-window-counter",
    ...config,
  });
}

export function tokenBucket(config: Omit<TokenBucketConfig, "name">) {
  return new PostgresTokenBucket({ name: "token-bucket", ...config });
}

export function leakyBucket(config: Omit<LeakyBucketConfig, "name">) {
  return new PostgresLeakyBucket({ name: "leaky-bucket", ...config });
}

export function shapingLeakyBucket(config: Omit<LeakyBucketConfig, "name">) {
  return new PostgresShapingLeakyBucket({ name: "leaky-bucket", ...config });
}

export function gcra(config: Omit<GCRAConfig, "name">) {
  return new PostgresGCRA({ name: "gcra", ...config });
}
