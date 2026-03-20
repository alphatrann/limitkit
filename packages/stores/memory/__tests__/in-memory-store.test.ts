import {
  fixedWindow,
  gcra,
  InMemoryFixedWindow,
  InMemoryGCRA,
  InMemoryLeakyBucket,
  InMemorySlidingWindow,
  InMemorySlidingWindowCounter,
  InMemoryStore,
  InMemoryTokenBucket,
  leakyBucket,
  slidingWindow,
  slidingWindowCounter,
  tokenBucket,
} from "../src";

const base = 1_000_000;

function getAlgorithms() {
  return [
    {
      name: "FixedWindow",
      instance: () =>
        fixedWindow({
          limit: 10,
          window: 10,
        }),
      limit: 10,
    },
    {
      name: "SlidingWindow",
      instance: () =>
        slidingWindow({
          limit: 10,
          window: 10,
        }),
      limit: 10,
    },
    {
      name: "SlidingWindowCounter",
      instance: () =>
        slidingWindowCounter({
          limit: 10,
          window: 10,
        }),
      limit: 10,
    },
    {
      name: "TokenBucket",
      instance: () =>
        tokenBucket({
          capacity: 10,
          refillRate: 5,
        }),
      limit: 10,
    },
    {
      name: "LeakyBucket",
      instance: () =>
        leakyBucket({
          capacity: 10,
          leakRate: 5,
        }),
      limit: 10,
    },
    {
      name: "GCRA",
      instance: () => gcra({ burst: 10, interval: 1 }),
      limit: 10,
    },
  ];
}

describe("InMemoryStore Global Tests", () => {
  const algorithms = getAlgorithms();

  describe.each(algorithms)("$name", ({ instance, limit }) => {
    let store: InMemoryStore;
    let limiter: any;

    beforeEach(() => {
      store = new InMemoryStore();
      limiter = instance();
    });

    test("should validate the config params before consuming", async () => {
      const limiterSpy = jest.spyOn(limiter, "validate");
      await store.consume("user", limiter, base);

      expect(limiterSpy).toHaveBeenCalled();
    });

    test("allows requests within limit", async () => {
      let allowed = 0;

      for (let i = 0; i < limit; i++) {
        const r = await store.consume("user", limiter, base);
        if (r.allowed) allowed++;
      }

      expect(allowed).toBe(limit);
    });

    test("rejects when exceeding limit", async () => {
      for (let i = 0; i < limit; i++) {
        await store.consume("user", limiter, base);
      }

      const r = await store.consume("user", limiter, base);

      expect(r.allowed).toBe(false);
    });

    test("state persists between requests", async () => {
      const r1 = await store.consume("user", limiter, base);
      const r2 = await store.consume("user", limiter, base);

      expect(r2.remaining).toBeLessThanOrEqual(r1.remaining);
    });

    test("different keys have isolated state", async () => {
      await store.consume("userA", limiter, base);

      const r = await store.consume("userB", limiter, base);

      expect(r.remaining).toBe(limit - 1);
    });

    test("large time jump restores capacity", async () => {
      for (let i = 0; i < limit; i++) {
        await store.consume("user", limiter, base);
      }

      const r = await store.consume("user", limiter, base + 60_000);

      expect(r.allowed).toBe(true);
    });

    test("cost parameter works correctly", async () => {
      const r = await store.consume("user", limiter, base, 3);

      expect(r.remaining).toBeLessThanOrEqual(limit - 3);
    });

    test("burst concurrency respects limit", async () => {
      const promises = [];

      for (let i = 0; i < limit * 2; i++) {
        promises.push(store.consume("user", limiter, base));
      }

      const results = await Promise.all(promises);

      const allowed = results.filter((r) => r.allowed).length;

      expect(allowed).toBeLessThanOrEqual(limit);
    });

    test("mixed cost concurrency respects limit", async () => {
      const costs = [3, 2, 4, 1, 5, 2];

      const results = await Promise.all(
        costs.map((c) => store.consume("user", limiter, base, c)),
      );

      let acceptedCost = 0;

      results.forEach((r, i) => {
        if (r.allowed) acceptedCost += costs[i];
      });

      expect(acceptedCost).toBeLessThanOrEqual(limit);
    });

    test("concurrency across multiple keys", async () => {
      const promises = [];

      for (let i = 0; i < 10; i++) {
        promises.push(store.consume("userA", limiter, base));
        promises.push(store.consume("userB", limiter, base));
      }

      const results = await Promise.all(promises);

      const userA = results.filter((_, i) => i % 2 === 0);
      const userB = results.filter((_, i) => i % 2 === 1);

      expect(userA.filter((r) => r.allowed).length).toBeLessThanOrEqual(limit);

      expect(userB.filter((r) => r.allowed).length).toBeLessThanOrEqual(limit);
    });

    test("reset is always in the future", async () => {
      const r = await store.consume("user", limiter, base);

      expect(r.resetAt).toBeGreaterThanOrEqual(base);
    });

    test("remaining never negative", async () => {
      for (let i = 0; i < limit * 2; i++) {
        const r = await store.consume("user", limiter, base);

        expect(r.remaining).toBeGreaterThanOrEqual(0);
      }
    });

    test("stress test random costs", async () => {
      const costs = Array.from(
        { length: 50 },
        () => Math.floor(Math.random() * 5) + 1,
      );

      const results = await Promise.all(
        costs.map((c) => store.consume("user", limiter, base, c)),
      );

      let acceptedCost = 0;

      results.forEach((r, i) => {
        if (r.allowed) acceptedCost += costs[i];
      });

      expect(acceptedCost).toBeLessThanOrEqual(limit);
    });
  });
});
