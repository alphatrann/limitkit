import { toRateLimitHeaders } from "../src";

describe("toRateLimitHeaders", () => {
  const now = 1000;

  beforeEach(() => {
    jest.spyOn(Date, "now").mockReturnValue(now);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("uses most restrictive rule when allowed", () => {
    const r1 = {
      name: "r1",
      limit: 10,
      remaining: 5,
      resetAt: 2000,
      allowed: true,
    };
    const r2 = {
      name: "r2",
      limit: 10,
      remaining: 1,
      resetAt: 1500,
      allowed: true,
    };

    const result = {
      allowed: true,
      failedRule: null,
      rules: [r1, r2],
    };

    const headers = toRateLimitHeaders(result);

    expect(headers["RateLimit-Limit"]).toBe(10);
    expect(headers["RateLimit-Remaining"]).toBe(1);
    expect(headers["RateLimit-Reset"]).toBe(Math.ceil((1500 - now) / 1000));
  });

  it("uses failed rule when rejected", () => {
    const r1 = {
      name: "r1",
      limit: 10,
      remaining: 0,
      resetAt: 2000,
      allowed: false,
    };

    const result = {
      allowed: false,
      failedRule: "r1",
      rules: [r1],
    };

    const headers = toRateLimitHeaders(result);

    expect(headers["RateLimit-Limit"]).toBe(10);
    expect(headers["RateLimit-Remaining"]).toBe(0);
  });

  it("includes Retry-After when retryAt is present", () => {
    const r1 = {
      name: "r1",
      limit: 10,
      remaining: 0,
      resetAt: 2000,
      retryAt: 3000,
      allowed: false,
    };

    const result = {
      allowed: false,
      failedRule: "r1",
      rules: [r1],
    };

    const headers = toRateLimitHeaders(result);

    expect(headers["Retry-After"]).toBe(Math.ceil((3000 - now) / 1000));
  });

  it("does not include Retry-After when retryAt is absent", () => {
    const r1 = {
      name: "r1",
      limit: 10,
      remaining: 0,
      resetAt: 2000,
      allowed: false,
    };

    const result = {
      allowed: false,
      failedRule: "r1",
      rules: [r1],
    };

    const headers = toRateLimitHeaders(result);

    expect(headers["Retry-After"]).toBeUndefined();
  });
});
