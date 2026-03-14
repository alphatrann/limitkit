import { Test } from "@nestjs/testing";
import { Controller, Get, INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { LimitModule } from "../src/limit.module";
import { InMemoryFixedWindow, InMemoryStore } from "@limitkit/memory";
import { getUserTier } from "./utils";
import { RateLimit, SkipRateLimit } from "../src";
import { NoLimitController } from "./controllers";

@RateLimit({
  rules: [
    {
      name: "controller-limit",
      key: (req: any) => req.ip,
      policy: new InMemoryFixedWindow({
        name: "fixed-window",
        window: 60,
        limit: 3,
      }),
    },
  ],
})
@Controller()
export class TestController {
  @SkipRateLimit()
  @Get("/open")
  open() {
    return { ok: true };
  }

  @Get("/controller")
  controllerLimit() {
    return { ok: true };
  }

  @RateLimit({
    rules: [
      {
        name: "route-limit",
        key: (req: any) => req.ip,
        policy: new InMemoryFixedWindow({
          name: "fixed-window",
          window: 60,
          limit: 1,
        }),
      },
    ],
  })
  @Get("/route-limit")
  routeLimit() {
    return { ok: true };
  }
}

describe("LimitModule + in-memory tests", () => {
  let app: INestApplication;

  describe("LimitModule forRoot", () => {
    beforeEach(async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          LimitModule.forRoot({
            store: new InMemoryStore(),
            debug: false,
            rules: [
              {
                name: "global-ip-limit",
                key: (req: any) => req.ip,
                policy: new InMemoryFixedWindow({
                  name: "fixed-window",
                  window: 60,
                  limit: 5,
                }),
              },
            ],
          }),
        ],
        controllers: [TestController, NoLimitController],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();
    });

    afterEach(async () => {
      await app.close();
    });

    const server = () => app.getHttpServer();

    it("should skip rate limit when @SkipRateLimit is used", async () => {
      await request(server()).get("/open").expect(200);
      await request(server()).get("/open").expect(200);
      await request(server()).get("/open").expect(200);
      await request(server()).get("/open").expect(200);
      await request(server()).get("/open").expect(200);
      await request(server()).get("/open").expect(200);
    });

    it("should enforce global rate limit and return headers", async () => {
      const res1 = await request(server()).get("/limited").expect(200);

      expect(res1.headers["ratelimit-limit"]).toBe("5");
      expect(res1.headers["ratelimit-remaining"]).toBe("4");
      expect(res1.headers["ratelimit-reset"]).toBeDefined();

      const res2 = await request(server()).get("/limited").expect(200);

      expect(res2.headers["ratelimit-remaining"]).toBe("3");

      await request(server()).get("/limited").expect(200);
      await request(server()).get("/limited").expect(200);
      await request(server()).get("/limited").expect(200);

      const res6 = await request(server()).get("/limited").expect(429);

      expect(res6.headers["retry-after"]).toBeDefined();
    });

    it("should override global rule with route rule and return headers", async () => {
      const res1 = await request(server()).get("/route-limit").expect(200);

      expect(res1.headers["ratelimit-limit"]).toBe("1");
      expect(res1.headers["ratelimit-remaining"]).toBe("0");

      const res2 = await request(server()).get("/route-limit").expect(429);

      expect(res2.headers["retry-after"]).toBeDefined();
    });

    it("should enforce controller level rules and return headers", async () => {
      const r1 = await request(server()).get("/controller").expect(200);
      expect(r1.headers["ratelimit-limit"]).toBe("3");
      expect(r1.headers["ratelimit-remaining"]).toBe("2");

      await request(server()).get("/controller").expect(200);
      await request(server()).get("/controller").expect(200);

      const r4 = await request(server()).get("/controller").expect(429);
      expect(r4.headers["retry-after"]).toBeDefined();
    });

    it("should not set rate limit headers when skipped", async () => {
      const res = await request(server()).get("/open").expect(200);

      expect(res.headers["ratelimit-limit"]).toBeUndefined();
      expect(res.headers["ratelimit-remaining"]).toBeUndefined();
      expect(res.headers["ratelimit-reset"]).toBeUndefined();
    });
  });

  describe("LimitModule forRootAsync", () => {
    beforeEach(async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          LimitModule.forRootAsync({
            useFactory: () => {
              return {
                store: new InMemoryStore(),
                rules: [
                  {
                    key: (req: any) =>
                      "user:" +
                      String(
                        req.headers["user-id"] ? +req.headers["user-id"] : 1001,
                      ),
                    policy: async (req: any) => {
                      const userId = req.headers["user-id"]
                        ? +req.headers["user-id"]
                        : 1001;
                      const tier = await getUserTier(userId);
                      if (tier === "enterprise")
                        return new InMemoryFixedWindow({
                          name: "fixed-window",
                          window: 60,
                          limit: 5,
                        });
                      if (tier === "pro")
                        return new InMemoryFixedWindow({
                          name: "fixed-window",
                          window: 60,
                          limit: 3,
                        });
                      return new InMemoryFixedWindow({
                        name: "fixed-window",
                        window: 60,
                        limit: 1,
                      });
                    },
                    name: "tier-limit",
                  },
                ],
                debug: false,
              };
            },
          }),
        ],
        controllers: [NoLimitController],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();
    });

    afterEach(async () => {
      await app.close();
    });

    const server = () => app.getHttpServer();

    it("enterprise tier should get higher limits", async () => {
      await request(server()).get("/limited").set("user-id", "1").expect(200);
      await request(server()).get("/limited").set("user-id", "1").expect(200);
      await request(server()).get("/limited").set("user-id", "1").expect(200);
      await request(server()).get("/limited").set("user-id", "1").expect(200);
      await request(server()).get("/limited").set("user-id", "1").expect(200);
      await request(server()).get("/limited").set("user-id", "1").expect(429);
    });

    it("pro tier should get lower limits than enterprise", async () => {
      await request(server()).get("/limited").set("user-id", "101").expect(200);
      await request(server()).get("/limited").set("user-id", "101").expect(200);
      await request(server()).get("/limited").set("user-id", "101").expect(200);
      await request(server()).get("/limited").set("user-id", "101").expect(429);
    });

    it("basic tier should get lower limits than pro", async () => {
      await request(server()).get("/limited").expect(200);
      await request(server()).get("/limited").expect(429);
    });
  });
});
