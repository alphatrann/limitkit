import {
  FixedWindowConfig,
  GCRAConfig,
  LeakyBucketConfig,
  SlidingWindowConfig,
  SlidingWindowCounterConfig,
  TokenBucketConfig,
} from "@limitkit/core";
import {
  InMemoryFixedWindow,
  InMemoryGCRA,
  InMemoryLeakyBucket,
  InMemorySlidingWindow,
  InMemorySlidingWindowCounter,
  InMemoryTokenBucket,
} from "./algorithms";

export function fixedWindow(config: Omit<FixedWindowConfig, "name">) {
  return new InMemoryFixedWindow({ name: "fixed-window", ...config });
}

export function slidingWindow(config: Omit<SlidingWindowConfig, "name">) {
  return new InMemorySlidingWindow({
    name: "sliding-window",
    ...config,
  });
}

export function slidingWindowCounter(
  config: Omit<SlidingWindowCounterConfig, "name">,
) {
  return new InMemorySlidingWindowCounter({
    name: "sliding-window-counter",
    ...config,
  });
}

export function tokenBucket(config: Omit<TokenBucketConfig, "name">) {
  return new InMemoryTokenBucket({ name: "token-bucket", ...config });
}

export function leakyBucket(config: Omit<LeakyBucketConfig, "name">) {
  return new InMemoryLeakyBucket({ name: "leaky-bucket", ...config });
}

export function gcra(config: Omit<GCRAConfig, "name">) {
  return new InMemoryGCRA({ name: "gcra", ...config });
}
