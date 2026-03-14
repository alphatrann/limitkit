import { limit } from "../src";
import * as core from "@limitkit/core";
import { Request, Response, NextFunction } from "express";

jest.mock("@limitkit/core", () => {
  const actual = jest.requireActual("@limitkit/core");

  // 1. Create the mock function
  const MockRateLimiter = jest.fn().mockImplementation((config) => {
    return new actual.RateLimiter(config);
  });

  // 2. IMPORTANT: Copy the prototype from the actual class to the mock.
  // This ensures jest.spyOn(core.RateLimiter.prototype, 'consume') can find the method.
  MockRateLimiter.prototype = actual.RateLimiter.prototype;

  return {
    ...actual,
    RateLimiter: MockRateLimiter,
  };
});

const MockedRateLimiter = core.RateLimiter as jest.Mock;

class MockFixedWindow extends core.FixedWindow {}

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

    jest.clearAllMocks();
  });

  const createBaseLimiter = () =>
    new core.RateLimiter<Request>({
      debug: false,
      store: {} as any,
      rules: [
        {
          name: "test",
          key: "global",
          policy: new MockFixedWindow({
            name: "fixed-window",
            window: 60,
            limit: 100,
          }),
        },
      ],
    });

  it("calls consume with the request", async () => {
    const consumeSpy = jest
      .spyOn(core.RateLimiter.prototype, "consume")
      .mockResolvedValue({
        allowed: true,
        limit: 10,
        remaining: 9,
        reset: 60,
      } as any);

    const middleware = limit(createBaseLimiter());
    await middleware(req as Request, res as Response, next);

    expect(consumeSpy).toHaveBeenCalledWith(req);
  });

  it("sets rate limit headers", async () => {
    jest.spyOn(core.RateLimiter.prototype, "consume").mockResolvedValue({
      allowed: true,
      limit: 100,
      remaining: 50,
      reset: 60,
    } as any);

    const middleware = limit(createBaseLimiter());
    await middleware(req as Request, res as Response, next);

    expect(res.setHeader).toHaveBeenCalledWith("RateLimit-Limit", 100);
    expect(res.setHeader).toHaveBeenCalledWith("RateLimit-Remaining", 50);
  });

  it("returns 429 when limit exceeded", async () => {
    jest.spyOn(core.RateLimiter.prototype, "consume").mockResolvedValue({
      allowed: false,
      limit: 10,
      remaining: 0,
      reset: 60,
      retryAfter: 15,
    } as any);

    const middleware = limit(createBaseLimiter());
    await middleware(req as Request, res as Response, next);

    expect(res.setHeader).toHaveBeenCalledWith("Retry-After", 15);
    expect(res.status).toHaveBeenCalledWith(429);
  });

  it("overrides debug config from route config", () => {
    const globalStore = { name: "global-store" } as any;
    const globalRule = {
      name: "global-rule",
      key: "global",
      policy: new MockFixedWindow({
        name: "fixed-window",
        window: 60,
        limit: 100,
      }),
    };

    const limiter = new core.RateLimiter<Request>({
      debug: false,
      store: globalStore,
      rules: [globalRule],
    });

    MockedRateLimiter.mockClear();

    limit(limiter, { debug: true });

    expect(MockedRateLimiter).toHaveBeenCalledWith(
      expect.objectContaining({
        debug: true,
        rules: [globalRule],
        store: globalStore,
      }),
    );
  });

  it("appends new route rules when name does not exist", () => {
    const store = { name: "store" } as any;
    const globalRule = { name: "global", key: "g", policy: {} as any };
    const routeRule = { name: "route", key: "r", policy: {} as any };

    const limiter = new core.RateLimiter<Request>({
      debug: false,
      store,
      rules: [globalRule],
    });
    MockedRateLimiter.mockClear();

    limit(limiter, { rules: [routeRule] });

    expect(MockedRateLimiter).toHaveBeenCalledWith(
      expect.objectContaining({
        rules: [globalRule, routeRule],
      }),
    );
  });
});
