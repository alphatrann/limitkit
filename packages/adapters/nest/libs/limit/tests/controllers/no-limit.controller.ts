import { Controller, Get } from "@nestjs/common";

@Controller()
export class NoLimitController {
  @Get("/limited")
  limited() {
    return { ok: true };
  }
}
