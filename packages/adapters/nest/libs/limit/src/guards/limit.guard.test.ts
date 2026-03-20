import "reflect-metadata";

import { Test } from "@nestjs/testing";
import { ExecutionContext, InternalServerErrorException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { FixedWindow, RateLimiter } from "@limitkit/core";
import {
  RATE_LIMIT_CONFIG_METADATA_KEY,
  SKIP_RATE_LIMIT_METADATA_KEY,
} from "../limit.tokens";
import { TooManyRequestsException } from "../exceptions";
import { LimitGuard } from "./limit.guard";

class MockFixedWindow extends FixedWindow {}

describe("LimitGuard", () => {
  let guard: LimitGuard;

  let mockStore: {
    consume: jest.Mock;
  };

  const createContext = (options: {
    handlerMeta?: any;
    controllerMeta?: any;
    handlerSkip?: boolean;
    controllerSkip?: boolean;
  }): ExecutionContext => {
    const req = {};
    const res = {
      set: jest.fn(),
    };

    const handler = () => {};
    const controller = class {};

    Reflect.defineMetadata(
      RATE_LIMIT_CONFIG_METADATA_KEY,
      options.handlerMeta,
      handler,
    );

    Reflect.defineMetadata(
      RATE_LIMIT_CONFIG_METADATA_KEY,
      options.controllerMeta,
      controller,
    );

    Reflect.defineMetadata(
      SKIP_RATE_LIMIT_METADATA_KEY,
      options.handlerSkip,
      handler,
    );

    Reflect.defineMetadata(
      SKIP_RATE_LIMIT_METADATA_KEY,
      options.controllerSkip,
      controller,
    );

    return {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
      getHandler: () => handler,
      getClass: () => controller,
    } as any;
  };

  beforeEach(async () => {
    mockStore = {
      consume: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        Reflector,
        {
          provide: RateLimiter,
          useFactory: () =>
            new RateLimiter({
              store: mockStore as any,
              rules: [
                {
                  name: "global",
                  key: "global",
                  policy: new MockFixedWindow({
                    name: "fixed-window",
                    window: 60,
                    limit: 10,
                  }),
                },
              ],
            }),
        },
        LimitGuard,
      ],
    }).compile();

    guard = moduleRef.get(LimitGuard);

    jest.clearAllMocks();
  });

  it("should allow request when under limit", async () => {
    mockStore.consume.mockResolvedValue({
      allowed: true,
      limit: 10,
      remaining: 9,
      resetAt: Date.now() + 1000,
    });

    const context = createContext({});

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockStore.consume).toHaveBeenCalled();
  });

  it("should set headers", async () => {
    const res = { set: jest.fn() };

    mockStore.consume.mockResolvedValue({
      allowed: true,
      limit: 10,
      remaining: 5,
      resetAt: Date.now() + 1000,
    });

    const context = {
      switchToHttp: () => ({
        getRequest: () => ({}),
        getResponse: () => res,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any;

    await guard.canActivate(context);

    expect(res.set).toHaveBeenCalled();
  });

  it("should throw when rate limit exceeded", async () => {
    mockStore.consume.mockResolvedValue({
      allowed: false,
      limit: 10,
      remaining: 0,
      resetAt: Date.now() + 1000,
    });

    const context = createContext({});

    await expect(guard.canActivate(context)).rejects.toThrow(
      TooManyRequestsException,
    );
  });

  it("should skip when handler has @SkipRateLimit", async () => {
    const context = createContext({
      handlerSkip: true,
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(mockStore.consume).not.toHaveBeenCalled();
  });

  it("should apply only handler rules when controller is skipped", async () => {
    mockStore.consume.mockResolvedValue({
      allowed: true,
      limit: 1,
      remaining: 0,
      resetAt: Date.now() + 1000,
    });

    const context = createContext({
      controllerSkip: true,
      handlerMeta: {
        rules: [
          {
            name: "handler",
            key: "h",
            policy: new MockFixedWindow({
              name: "fixed-window",
              window: 10,
              limit: 60,
            }),
          },
        ],
      },
    });

    await guard.canActivate(context);

    expect(mockStore.consume).toHaveBeenCalled();
  });

  it("should merge global + controller + handler rules", async () => {
    mockStore.consume.mockResolvedValue({
      allowed: true,
      limit: 10,
      remaining: 9,
      resetAt: Date.now() + 1000,
    });

    const context = createContext({
      controllerMeta: {
        rules: [
          {
            name: "controller",
            key: "c",
            policy: new MockFixedWindow({
              name: "fixed-window",
              window: 60,
              limit: 10,
            }),
          },
        ],
      },
      handlerMeta: {
        rules: [
          {
            name: "handler",
            key: "h",
            policy: new MockFixedWindow({
              name: "fixed-window",
              window: 60,
              limit: 5,
            }),
          },
        ],
      },
    });

    await guard.canActivate(context);

    expect(mockStore.consume).toHaveBeenCalled();
  });
});
