import * as express from "express";
import * as request from "supertest";
import { limit } from "../src";
import { RateLimiter } from "@limitkit/core";
import { createClient, RedisClientType } from "redis";
import { RedisFixedWindow, RedisStore } from "@limitkit/redis";

describe("RedisStore", () => {
  let redis: RedisClientType;
  let store: RedisStore;
  let app: express.Express;

  async function createApp() {
    const app = express();
    redis = createClient({
      url: "redis://localhost:6379/14",
    });
    await redis.connect();
    await redis.flushDb();
    store = new RedisStore(redis);

    const limiter = new RateLimiter({
      store,
      rules: [
        {
          name: "global-limit",
          key: "global",
          policy: new RedisFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 2,
          }),
        },
      ],
    });

    app.get("/test", limit(limiter, {}), (req, res) => {
      res.json({ ok: true });
    });
    return app;
  }

  afterAll(async () => {
    await redis.quit();
  });

  beforeAll(async () => {
    app = await createApp();
  });

  afterEach(async () => {
    await redis.flushDb();
  });

  describe("limit middleware (e2e)", () => {
    it("allows requests under limit", async () => {
      const res = await request(app).get("/test");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });

      expect(res.headers["ratelimit-limit"]).toBeDefined();
      expect(res.headers["ratelimit-remaining"]).toBeDefined();
      expect(res.headers["ratelimit-reset"]).toBeDefined();
    });

    it("blocks requests when limit exceeded", async () => {
      await request(app).get("/test");
      await request(app).get("/test");

      const res = await request(app).get("/test");

      expect(res.status).toBe(429);
      expect(res.body).toEqual({
        status: 429,
        error: "Too many requests",
      });

      expect(res.headers["retry-after"]).toBeDefined();
    });

    it("decreases remaining count", async () => {
      const first = await request(app).get("/test");
      const second = await request(app).get("/test");

      expect(Number(first.headers["ratelimit-remaining"])).toBeGreaterThan(
        Number(second.headers["ratelimit-remaining"]),
      );
    });

    it("blocks requests when limit exceeded under concurrency", async () => {
      await Promise.all([
        request(app).get("/test"),
        request(app).get("/test"),
        request(app).get("/test"),
        request(app).get("/test"),
        request(app).get("/test"),
      ]);

      const res = await request(app).get("/test");

      expect(res.status).toBe(429);
      expect(res.body).toEqual({
        status: 429,
        error: "Too many requests",
      });

      expect(res.headers["retry-after"]).toBeDefined();
    });
  });
});
