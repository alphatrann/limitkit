import {
  Algorithm,
  AlgorithmConfig,
  BadArgumentsException,
  RateLimitResult,
  Store,
  UnknownAlgorithmException,
} from "@limitkit/core";
import { RedisClientType } from "redis";
import * as fs from "fs/promises";
import * as path from "path";
import { Clock } from "./types";
import { SystemClock } from "./system-clock";

export class RedisStore implements Store {
  private scriptsSha = new Map<string, string>();
  private scriptsLoaded = false;

  constructor(
    private redis: RedisClientType,
    private clock: Clock = new SystemClock(),
  ) {}

  async init(): Promise<void> {
    if (this.scriptsLoaded) return;
    await this.loadScripts();
    this.scriptsLoaded = true;
  }

  private async loadScripts() {
    const algorithms = Object.values(Algorithm);
    for (const algorithm of algorithms) {
      const scriptPath = path.join(__dirname, "scripts", `${algorithm}.lua`);
      const script = await fs.readFile(scriptPath, "utf-8");
      const sha = await this.redis.scriptLoad(script);
      this.scriptsSha.set(algorithm, sha);
    }
  }

  async consume(
    key: string,
    config: AlgorithmConfig,
    cost: number = 1,
  ): Promise<RateLimitResult> {
    const sha = this.scriptsSha.get(config.name);
    if (!sha) throw new UnknownAlgorithmException(config.name);
    const now = this.clock.now();

    let allowed: number;
    let remaining: number;
    let reset: number;
    let retryAfter: number;

    switch (config.name) {
      case Algorithm.FixedWindow:
      case Algorithm.SlidingWindow:
      case Algorithm.SlidingWindowCounter:
        [allowed, remaining, reset, retryAfter] = (await this.redis.evalSha(
          sha,
          {
            keys: [key],
            arguments: [
              now.toString(),
              (config.window * 1000).toString(),
              config.limit.toString(),
              cost.toString(),
            ],
          },
        )) as [number, number, number, number];
        break;
      case Algorithm.TokenBucket:
        if (config.capacity <= 0)
          throw new BadArgumentsException(
            `Capacity must be a positive integer, got capacity=${config.capacity}`,
          );

        if (config.refillRate <= 0)
          throw new BadArgumentsException(
            `Refill rate must be a positive integer, got refill_rate=${config.refillRate}`,
          );

        [allowed, remaining, reset, retryAfter] = (await this.redis.evalSha(
          sha,
          {
            keys: [key],
            arguments: [
              now.toString(),
              config.refillRate.toString(),
              config.capacity.toString(),
              cost.toString(),
            ],
          },
        )) as [number, number, number, number];
        break;
      case Algorithm.LeakyBucket:
        if (config.capacity <= 0)
          throw new BadArgumentsException(
            `Capacity must be a positive integer, got capacity=${config.capacity}`,
          );
        if (config.leakRate <= 0)
          throw new BadArgumentsException(
            `Leak rate must be a positive integer, got leak_rate=${config.leakRate}`,
          );
        [allowed, remaining, reset, retryAfter] = (await this.redis.evalSha(
          sha,
          {
            keys: [key],
            arguments: [
              now.toString(),
              config.leakRate.toString(),
              config.capacity.toString(),
              cost.toString(),
            ],
          },
        )) as [number, number, number, number];
        break;
      case Algorithm.GCRA:
        if (config.burst <= 0)
          throw new BadArgumentsException(
            `Burst must be a positive integer, got burst=${config.burst}`,
          );

        if (config.interval <= 0)
          throw new BadArgumentsException(
            `Interval must be a positive integer, got interval=${config.interval}`,
          );

        if (cost > config.burst)
          throw new BadArgumentsException(
            `Cost must never exceed burst, got burst=${config.interval}, cost=${cost}`,
          );
        [allowed, remaining, reset, retryAfter] = (await this.redis.evalSha(
          sha,
          {
            keys: [key],
            arguments: [
              now.toString(),
              (config.interval * 1000).toString(),
              config.burst.toString(),
              cost.toString(),
            ],
          },
        )) as [number, number, number, number];
        break;
    }

    return { allowed: !!allowed, remaining, reset, retryAfter };
  }
}
