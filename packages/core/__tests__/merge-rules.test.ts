import {
  Algorithm,
  FixedWindowConfig,
  mergeRules,
  TokenBucketConfig,
} from "../src";

describe("mergeRules", () => {
  const baseRule = {
    name: "api",
    key: "api",
    policy: {
      name: Algorithm.FixedWindow,
      window: 60,
      limit: 100,
    } as FixedWindowConfig,
  };

  it("returns global rules when route rules empty", () => {
    const result = mergeRules([baseRule], []);

    expect(result).toEqual([baseRule]);
  });

  it("adds new route rule", () => {
    const routeRule = {
      name: "login",
      key: "login",
      policy: {
        name: Algorithm.TokenBucket,
        capacity: 5,
        refillRate: 1,
      } as TokenBucketConfig,
    };

    const result = mergeRules([baseRule], [routeRule]);

    expect(result).toHaveLength(2);
  });

  it("overrides rule with same name", () => {
    const routeRule = {
      name: "api",
      key: "api",
      policy: {
        name: Algorithm.FixedWindow,
        window: 60,
        limit: 10,
      } as FixedWindowConfig,
    };

    const result = mergeRules([baseRule], [routeRule]);

    expect(result).toEqual([routeRule]);
  });

  it("merges rule properties when overriding", () => {
    const globalRule = {
      name: "api",
      key: "api",
      cost: 1,
      policy: {
        name: Algorithm.FixedWindow,
        window: 60,
        limit: 100,
      } as FixedWindowConfig,
    };

    const routeRule = {
      name: "api",
      key: "api",
      policy: {
        name: Algorithm.FixedWindow,
        window: 60,
        limit: 10,
      } as FixedWindowConfig,
    };

    const result = mergeRules([globalRule], [routeRule]);

    expect(result[0].cost).toBe(1);
    expect((result[0].policy as FixedWindowConfig).limit).toBe(10);
  });
});
