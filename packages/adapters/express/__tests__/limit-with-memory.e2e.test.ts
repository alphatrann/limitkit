import * as express from "express";
import * as request from "supertest";
import { limit } from "../src";
import { Algorithm, RateLimiter } from "@limitkit/core";
import { InMemoryStore } from "@limitkit/memory";

function createApp() {
  const app = express();

  const limiter = new RateLimiter({
    store: new InMemoryStore(),
    rules: [
      {
        name: "global-limit",
        key: "global",
        policy: {
          name: Algorithm.FixedWindow,
          window: 60,
          limit: 2,
        },
      },
    ],
  });

  app.get("/test", limit(limiter, {}), (req, res) => {
    res.json({ ok: true });
  });

  return app;
}

describe("limit middleware (e2e)", () => {
  it("allows requests under limit", async () => {
    const app = createApp();

    const res = await request(app).get("/test");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    expect(res.headers["ratelimit-limit"]).toBeDefined();
    expect(res.headers["ratelimit-remaining"]).toBeDefined();
    expect(res.headers["ratelimit-reset"]).toBeDefined();
  });

  it("blocks requests when limit exceeded", async () => {
    const app = createApp();

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
    const app = createApp();

    const first = await request(app).get("/test");
    const second = await request(app).get("/test");

    expect(Number(first.headers["ratelimit-remaining"])).toBeGreaterThan(
      Number(second.headers["ratelimit-remaining"]),
    );
  });
});
