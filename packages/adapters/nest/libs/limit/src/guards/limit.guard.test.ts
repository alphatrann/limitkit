import "reflect-metadata"; // remember to import this to avoid Reflector is undefined

jest.mock("@limitkit/core", () => {
  const consume = jest.fn().mockResolvedValue({ allowed: true });

  return {
    RateLimiter: jest.fn().mockImplementation((config) => ({
      config,
      consume,
    })),
    mergeRules: jest.fn((g, l) => [...(g ?? []), ...(l ?? [])]),
  };
});

import { Test } from "@nestjs/testing";
import { Reflector } from "@nestjs/core";
import { TooManyRequestsException } from "../exceptions";
import { LimitGuard } from "./limit.guard";
import { mergeRules, RateLimiter } from "@limitkit/core";
import { ExecutionContext } from "@nestjs/common";
import {
  RATE_LIMIT_CONFIG_METADATA_KEY,
  SKIP_RATE_LIMIT_METADATA_KEY,
} from "../limit.tokens";

describe("LimitGuard", () => {
  let guard: LimitGuard;
  let reflector: Reflector;

  const controller = {};
  const handler = {};

  const contextMock: ExecutionContext = {
    switchToHttp: () => ({
      getRequest: () => ({ ip: "127.0.0.1" }),
    }),
    getHandler: () => handler,
    getClass: () => controller,
  } as any;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        LimitGuard,
        {
          provide: Reflector,
          useValue: { get: jest.fn() },
        },
        {
          provide: RateLimiter,
          useValue: {
            config: {
              rules: [{ name: "global-rule" }],
              debug: false,
              store: { name: "global-store" },
            },
          },
        },
      ],
    }).compile();

    guard = module.get(LimitGuard);
    reflector = module.get(Reflector);

    (RateLimiter as jest.Mock).mockClear();
  });

  function mockMetadata(meta: {
    handlerConfig?: any;
    controllerConfig?: any;
    handlerSkip?: boolean;
    controllerSkip?: boolean;
  }) {
    jest.spyOn(reflector, "get").mockImplementation((key, target) => {
      if (key === RATE_LIMIT_CONFIG_METADATA_KEY && target === handler)
        return meta.handlerConfig;

      if (key === RATE_LIMIT_CONFIG_METADATA_KEY && target === controller)
        return meta.controllerConfig;

      if (key === SKIP_RATE_LIMIT_METADATA_KEY && target === handler)
        return meta.handlerSkip;

      if (key === SKIP_RATE_LIMIT_METADATA_KEY && target === controller)
        return meta.controllerSkip;

      return undefined;
    });
  }

  it("merges global + controller + handler rules", async () => {
    mockMetadata({
      controllerConfig: { rules: [{ name: "controller-rule" }] },
      handlerConfig: { rules: [{ name: "handler-rule" }] },
    });

    await guard.canActivate(contextMock);

    const config = (RateLimiter as jest.Mock).mock.calls[0][0];

    expect(mergeRules).toHaveBeenCalled();

    expect(config.rules).toEqual([
      { name: "global-rule" },
      { name: "controller-rule" },
      { name: "handler-rule" },
    ]);
  });

  it("handler config overrides controller config", async () => {
    mockMetadata({
      controllerConfig: { debug: false },
      handlerConfig: { debug: true, rules: [{ name: "handler-rule" }] },
    });

    await guard.canActivate(contextMock);

    const config = (RateLimiter as jest.Mock).mock.calls[0][0];

    expect(config.debug).toBe(true);
  });

  it("controller config overrides global config", async () => {
    mockMetadata({
      controllerConfig: {
        debug: true,
        store: { name: "controller-store" },
      },
    });

    await guard.canActivate(contextMock);

    const config = (RateLimiter as jest.Mock).mock.calls[0][0];

    expect(config.debug).toBe(true);
    expect(config.store).toEqual({ name: "controller-store" });
  });

  it("skips when handler skip exists", async () => {
    mockMetadata({
      handlerSkip: true,
    });

    const result = await guard.canActivate(contextMock);

    expect(result).toBe(true);
    expect(RateLimiter).not.toHaveBeenCalled();
  });

  it("skips when controller skip exists and no handler rules", async () => {
    mockMetadata({
      controllerSkip: true,
    });

    const result = await guard.canActivate(contextMock);

    expect(result).toBe(true);
    expect(RateLimiter).not.toHaveBeenCalled();
  });

  it("uses handler rules even when controller skip exists", async () => {
    mockMetadata({
      controllerSkip: true,
      handlerConfig: {
        rules: [{ name: "handler-rule" }],
      },
    });

    await guard.canActivate(contextMock);

    const config = (RateLimiter as jest.Mock).mock.calls[0][0];

    expect(config.rules).toEqual([{ name: "handler-rule" }]);
  });

  it("throws when limiter rejects request", async () => {
    (RateLimiter as jest.Mock).mockImplementation(() => ({
      consume: jest.fn().mockResolvedValue({ allowed: false }),
    }));

    mockMetadata({});

    await expect(guard.canActivate(contextMock)).rejects.toThrow(
      TooManyRequestsException,
    );
  });
});
