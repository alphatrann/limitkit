import { limit } from "../src";
import * as http from "@limitkit/http";
import * as core from "@limitkit/core";
import { Request, Response, NextFunction } from "express";

class MockFixedWindow extends core.FixedWindow {}

jest.mock("@limitkit/http", () => {
  const actual = jest.requireActual("@limitkit/http");

  return {
    ...actual,
    mergeRules: jest.fn(actual.mergeRules),
  };
});

describe("limit middleware", () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  let mockStore: {
    consume: jest.Mock;
  };

  beforeEach(() => {
    req = {};

    res = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    next = jest.fn();

    mockStore = {
      consume: jest.fn(),
    };

    jest.clearAllMocks();
  });

  const createLimiter = (rules: core.LimitRule<Request>[]) =>
    new core.RateLimiter<Request>({
      store: mockStore as any,
      rules,
    });

  const baseRule = (): core.LimitRule<Request> => ({
    name: "test",
    key: "global",
    policy: new MockFixedWindow({
      name: "fixed-window",
      window: 60,
      limit: 10,
    }),
  });

  it("calls store.consume through limiter", async () => {
    mockStore.consume.mockResolvedValue({
      allowed: true,
      limit: 10,
      remaining: 9,
      resetAt: Date.now() + 60000,
    });

    const limiter = createLimiter([baseRule()]);
    const middleware = limit(limiter);

    await middleware(req as Request, res as Response, next);

    expect(mockStore.consume).toHaveBeenCalled();
  });

  it("sets rate limit headers", async () => {
    mockStore.consume.mockResolvedValue({
      allowed: true,
      limit: 100,
      remaining: 50,
      resetAt: Date.now() + 60000,
    });

    const limiter = createLimiter([baseRule()]);
    const middleware = limit(limiter);

    await middleware(req as Request, res as Response, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      "RateLimit-Limit",
      expect.any(Number),
    );

    expect(res.setHeader).toHaveBeenCalledWith(
      "RateLimit-Remaining",
      expect.any(Number),
    );
  });

  it("returns 429 when limit exceeded", async () => {
    mockStore.consume.mockResolvedValue({
      allowed: false,
      limit: 10,
      remaining: 0,
      resetAt: Date.now() + 60000,
    });

    const limiter = createLimiter([baseRule()]);
    const middleware = limit(limiter);

    await middleware(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalled();
  });

  it("calls mergeRules with global and route rules", () => {
    const globalRule = baseRule();
    const routeRule: core.LimitRule<Request> = {
      name: "route",
      key: "route",
      policy: new MockFixedWindow({
        name: "fixed-window",
        window: 60,
        limit: 10,
      }),
    };

    const limiter = createLimiter([globalRule]);

    limit(limiter, { rules: [routeRule] });

    expect(http.mergeRules).toHaveBeenCalledWith([globalRule], [routeRule]);
  });

  it("creates new limiter with merged rules", async () => {
    const globalRule = baseRule();
    const routeRule: core.LimitRule<Request> = {
      name: "route",
      key: "route",
      policy: new MockFixedWindow({
        name: "fixed-window",
        window: 60,
        limit: 10,
      }),
    };

    mockStore.consume.mockResolvedValue({
      allowed: true,
      limit: 10,
      remaining: 9,
      resetAt: Date.now() + 60000,
    });

    const limiter = createLimiter([globalRule]);
    const middleware = limit(limiter, { rules: [routeRule] });

    await middleware(req as Request, res as Response, next);

    // Called twice: once for original limiter, once for merged limiter
    expect(mockStore.consume).toHaveBeenCalled();
  });

  it("does not call mergeRules when no route rules", () => {
    const limiter = createLimiter([baseRule()]);

    limit(limiter);

    expect(http.mergeRules).not.toHaveBeenCalled();
  });
});
