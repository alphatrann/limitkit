import { FixedWindow, SlidingWindow, SlidingWindowCounter } from "../src";

class MockFixedWindow extends FixedWindow {}
class MockSlidingWindow extends SlidingWindow {}
class MockSlidingWindowCounter extends SlidingWindowCounter {}

function testWindowValidation(AlgoClass: any, name: string) {
  describe(`${name}.validate`, () => {
    const config = {
      name,
      window: 60,
      limit: 100,
    };

    it("throws if limit <= 0", () => {
      const algo = new AlgoClass({ ...config, limit: 0 });
      expect(() => algo.validate()).toThrow();
    });

    it("throws if window <= 0", () => {
      const algo = new AlgoClass({ ...config, window: -1 });
      expect(() => algo.validate()).toThrow();
    });
  });
}

testWindowValidation(MockFixedWindow, "FixedWindow");
testWindowValidation(MockSlidingWindow, "SlidingWindow");
testWindowValidation(MockSlidingWindowCounter, "SlidingWindowCounter");
