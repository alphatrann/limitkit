import { limit } from "../src";
import { FixedWindow, RateLimiter } from "@limitkit/core";
import { Request, Response, NextFunction } from "express";

describe("limit middleware", () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {};

    res = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      on: jest.fn(),
    };

    next = jest.fn();

    jest.restoreAllMocks();
  });

  it("calls consume with the request", async () => {
    const consumeSpy = jest
      .spyOn(RateLimiter.prototype, "consume")
      .mockResolvedValue({
        allowed: true,
        limit: 10,
        remaining: 9,
        reset: 60,
      } as any);

    const baseLimiter = new RateLimiter<Request>({
      debug: false,
      store: {} as any,
      rules: [
        {
          name: "test",
          key: "global",
          policy: new FixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 100,
          }),
        },
      ],
    });

    const middleware = limit(baseLimiter, {});

    await middleware(req as Request, res as Response, next);

    expect(consumeSpy).toHaveBeenCalledWith(req);
  });

  it("sets rate limit headers", async () => {
    jest.spyOn(RateLimiter.prototype, "consume").mockResolvedValue({
      allowed: true,
      limit: 100,
      remaining: 50,
      reset: 60,
    } as any);

    const baseLimiter = new RateLimiter<Request>({
      debug: false,
      store: {} as any,
      rules: [
        {
          name: "test",
          key: "global",
          policy: new FixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 100,
          }),
        },
      ],
    });

    const middleware = limit(baseLimiter, {});

    await middleware(req as Request, res as Response, next);

    expect(res.setHeader).toHaveBeenCalledWith("RateLimit-Limit", 100);
    expect(res.setHeader).toHaveBeenCalledWith("RateLimit-Remaining", 50);
    expect(res.setHeader).toHaveBeenCalledWith("RateLimit-Reset", 60);
  });

  it("returns 429 when limit exceeded", async () => {
    jest.spyOn(RateLimiter.prototype, "consume").mockResolvedValue({
      allowed: false,
      limit: 10,
      remaining: 0,
      reset: 60,
      retryAfter: 15,
    } as any);

    const baseLimiter = new RateLimiter<Request>({
      debug: false,
      store: {} as any,
      rules: [
        {
          name: "test",
          key: "global",
          policy: new FixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 100,
          }),
        },
      ],
    });

    const middleware = limit(baseLimiter, {});

    await middleware(req as Request, res as Response, next);

    expect(res.setHeader).toHaveBeenCalledWith("Retry-After", 15);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      status: 429,
      error: "Too many requests",
    });
  });

  it("calls next when allowed", async () => {
    jest.spyOn(RateLimiter.prototype, "consume").mockResolvedValue({
      allowed: true,
      limit: 10,
      remaining: 5,
      reset: 60,
    } as any);

    const baseLimiter = new RateLimiter<Request>({
      debug: false,
      store: {} as any,
      rules: [
        {
          name: "test",
          key: "global",
          policy: new FixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 100,
          }),
        },
      ],
    });

    const middleware = limit(baseLimiter, {});

    await middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalled();
  });
});
