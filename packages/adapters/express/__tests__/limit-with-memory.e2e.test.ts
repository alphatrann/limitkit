import * as express from "express";
import * as request from "supertest";
import { limit } from "../src";
import { RateLimiter } from "@limitkit/core";
import { InMemoryFixedWindow, InMemoryStore } from "@limitkit/memory";

function createApp() {
  const app = express();

  const limiter = new RateLimiter({
    store: new InMemoryStore(),
    rules: [
      {
        name: "global-limit",
        key: "global",
        policy: new InMemoryFixedWindow({
          name: "fixed-window",
          window: 60,
          limit: 5,
        }),
      },
    ],
  });

  app.get("/test", limit(limiter), (req, res) => {
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
    expect(res.headers["reset-after"]).toBeDefined();
  });

  it("blocks requests when limit exceeded", async () => {
    const app = createApp();

    await request(app).get("/test");
    await request(app).get("/test");
    await request(app).get("/test");
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
    await request(app).get("/test");
    await request(app).get("/test");
    const fourth = await request(app).get("/test");

    expect(Number(first.headers["ratelimit-remaining"])).toBe(
      Number(fourth.headers["ratelimit-remaining"]) + 3,
    );
  });

  it("blocks requests when limit exceeded under concurrency", async () => {
    const app = createApp();

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
