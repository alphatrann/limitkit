import { Algorithm } from "@limitkit/core";
import { Controller, Get } from "@nestjs/common";
import { RateLimit, SkipRateLimit } from "../../src";

@RateLimit({
  rules: [
    {
      name: "controller-limit",
      key: (req: any) => req.ip,
      policy: {
        name: Algorithm.FixedWindow,
        window: 60,
        limit: 3,
      },
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
        policy: {
          name: Algorithm.FixedWindow,
          window: 60,
          limit: 1,
        },
      },
    ],
  })
  @Get("/route-limit")
  routeLimit() {
    return { ok: true };
  }
}
