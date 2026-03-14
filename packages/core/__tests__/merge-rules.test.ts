import { FixedWindow, mergeRules, TokenBucket } from "../src";

class MockFixedWindow extends FixedWindow {}
class MockTokenBucket extends TokenBucket {}
describe("mergeRules", () => {
  const baseRule = {
    name: "api",
    key: "api",
    policy: new MockFixedWindow({
      name: "fixed-window",
      window: 60,
      limit: 100,
    }),
  };

  it("returns global rules when route rules empty", () => {
    const result = mergeRules([baseRule], []);

    expect(result).toEqual([baseRule]);
  });

  it("adds new route rule", () => {
    const routeRule = {
      name: "login",
      key: "login",
      policy: new MockTokenBucket({
        name: "token-bucket",
        capacity: 5,
        refillRate: 1,
      }),
    };

    const result = mergeRules([baseRule], [routeRule]);

    expect(result).toHaveLength(2);
  });

  it("overrides rule with same name", () => {
    const routeRule = {
      name: "api",
      key: "api",
      policy: new MockFixedWindow({
        name: "fixed-window",
        window: 60,
        limit: 10,
      }),
    };

    const result = mergeRules([baseRule], [routeRule]);

    expect(result).toEqual([routeRule]);
  });

  it("merges rule properties when overriding", () => {
    const globalRule = {
      name: "api",
      key: "api",
      cost: 1,
      policy: new MockFixedWindow({
        name: "fixed-window",
        window: 60,
        limit: 100,
      }),
    };

    const routeRule = {
      name: "api",
      key: "api",
      policy: new MockFixedWindow({
        name: "fixed-window",
        window: 60,
        limit: 10,
      }),
    };

    const result = mergeRules([globalRule], [routeRule]);

    expect(result[0].cost).toBe(1);
    expect((result[0].policy as FixedWindow).config.limit).toBe(10);
  });
});
