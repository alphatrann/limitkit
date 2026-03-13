import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { LimitModule } from "../src/limit.module";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { Algorithm } from "@limitkit/core";
import { RedisStore } from "@limitkit/redis";
import { TestController, NoLimitController } from "./controllers";
import { getUserTier } from "./utils";
import { createClient, RedisClientType } from "redis";

describe("LimitModule + Redis (e2e)", () => {
  let app: INestApplication;

  describe("LimitModule forRoot", () => {
    let redis: RedisClientType;
    let redisStore: RedisStore;

    beforeAll(async () => {
      redis = createClient({ url: "redis://localhost:6382" });
      await redis.connect();
      redisStore = new RedisStore(redis);
      await redisStore.init();
    });

    afterEach(async () => {
      await app.close();
      await redis.flushDb();
    });

    afterAll(async () => {
      await redis.flushDb();
      await redis.close();
    });
    beforeEach(async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          LimitModule.forRoot({
            store: redisStore,
            debug: false,
            rules: [
              {
                name: "global-ip-limit",
                key: (req: any) => req.ip,
                policy: {
                  name: Algorithm.FixedWindow,
                  window: 60,
                  limit: 5,
                },
              },
            ],
          }),
        ],
        controllers: [TestController, NoLimitController],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();
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
    it("should enforce global rate limit", async () => {
      await request(server()).get("/limited").expect(200);
      await request(server()).get("/limited").expect(200);
      await request(server()).get("/limited").expect(200);
      await request(server()).get("/limited").expect(200);
      await request(server()).get("/limited").expect(200);
      await request(server()).get("/limited").expect(429);
    });

    it("should override global rule with route rule", async () => {
      await request(server()).get("/route-limit").expect(200);
      await request(server()).get("/route-limit").expect(429);
    });

    it("should enforce controller level rules", async () => {
      await request(server()).get("/controller").expect(200);
      await request(server()).get("/controller").expect(200);
      await request(server()).get("/controller").expect(200);
      await request(server()).get("/controller").expect(429);
    });
  });

  describe("LimitModule forRootAsync", () => {
    let redis: RedisClientType;

    beforeAll(async () => {
      redis = createClient({ url: "redis://localhost:6382" });
      await redis.connect();
    });

    afterAll(async () => {
      await redis.flushDb();
      await redis.close();
    });

    beforeEach(async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [
          LimitModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: async (configService: ConfigService) => {
              const redisStore = new RedisStore(redis);
              await redisStore.init();
              return {
                store: redisStore,
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
                        return {
                          name: Algorithm.FixedWindow,
                          window: 60,
                          limit: 5,
                        };
                      if (tier === "pro")
                        return {
                          name: Algorithm.FixedWindow,
                          window: 60,
                          limit: 3,
                        };
                      return {
                        name: Algorithm.FixedWindow,
                        window: 60,
                        limit: 1,
                      };
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
      await redis.flushDb();
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
