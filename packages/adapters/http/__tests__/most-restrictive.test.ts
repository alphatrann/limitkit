import { mostRestrictive } from "../src/utils/most-restrictive";

describe("mostRestrictive", () => {
  it("returns null when no rules", () => {
    const result = { allowed: true, failedRule: null, rules: [] };
    expect(mostRestrictive(result)).toBeNull();
  });

  it("returns the only rule if one exists", () => {
    const rule = {
      name: "r1",
      limit: 10,
      remaining: 5,
      resetAt: 1000,
      allowed: true,
    };
    const result = { allowed: true, failedRule: null, rules: [rule] };

    expect(mostRestrictive(result)).toEqual(rule);
  });

  it("selects rule with lowest remaining/limit ratio", () => {
    const r1 = {
      name: "r1",
      limit: 10,
      remaining: 5,
      resetAt: 1000,
      allowed: true,
    }; // 0.5
    const r2 = {
      name: "r2",
      limit: 10,
      remaining: 2,
      resetAt: 1000,
      allowed: true,
    }; // 0.2

    const result = { allowed: true, failedRule: null, rules: [r1, r2] };

    expect(mostRestrictive(result)).toEqual(r2);
  });

  it("breaks ties using later resetAt", () => {
    const r1 = {
      name: "r1",
      limit: 10,
      remaining: 2,
      resetAt: 1000,
      allowed: true,
    };
    const r2 = {
      name: "r2",
      limit: 10,
      remaining: 2,
      resetAt: 2000,
      allowed: true,
    };

    const result = { allowed: true, failedRule: null, rules: [r1, r2] };

    expect(mostRestrictive(result)).toEqual(r2);
  });
});
