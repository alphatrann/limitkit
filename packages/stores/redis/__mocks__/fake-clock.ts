import { Clock } from "../src";

export class FakeClock implements Clock {
  private currentMs = 0;
  now(): number {
    return this.currentMs;
  }

  advance(ms: number) {
    this.currentMs += ms;
  }
}
