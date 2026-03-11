import { Algorithm, GCRAConfig } from "@limitkit/core";
import { gcra, GCRAState } from "../src";

const config: GCRAConfig = {
  name: Algorithm.GCRA,
  interval: 1,
  burst: 3,
};

function createState(): GCRAState {
  return {
    tat: null,
  };
}

describe("gcra", () => {
  test("first request initializes TAT and calculates remaining", () => {
    const state = createState();
    const now = 1000;

    const res = gcra(state, config, now, 1);

    expect(res.output.allowed).toBe(true);
    // TAT = max(now, tat) + cost * interval = max(1000, 1000) + 1*1000 = 2000
    expect((res.state as GCRAState).tat).toBe(2000);
    expect(res.output.reset).toBe(2000);
    // backlog = 2000 - 1000 = 1000
    // remaining = floor((burstTolerance - backlog) / interval)
    // remaining = floor((2000 - 1000) / 1000) = 1
    expect(res.output.remaining).toBe(1);
  });

  test("burst allows exactly 3 requests at same time", () => {
    let state = createState();
    const t = 1000;

    // 1st request: remaining goes 1->0
    let res = gcra(state, config, t, 1);
    expect(res.output.allowed).toBe(true);
    expect(res.output.remaining).toBe(1);
    state = res.state as GCRAState;

    // 2nd request: remaining goes to 0
    res = gcra(state, config, t, 1);
    expect(res.output.allowed).toBe(true);
    expect(res.output.remaining).toBe(0);
    state = res.state as GCRAState;

    // 3rd request: still allowed (remaining was 0, becomes negative but capped)
    res = gcra(state, config, t, 1);
    expect(res.output.allowed).toBe(true);
    expect(res.output.remaining).toBe(0);
    state = res.state as GCRAState;

    // 4th request: rejected
    res = gcra(state, config, t, 1);
    expect(res.output.allowed).toBe(false);
    expect(res.output.remaining).toBe(0);
  });

  test("TAT equation: new_tat = max(now, old_tat) + cost * interval", () => {
    let state = createState();
    const t = 1000;

    // First request: tat=null->1000, new_tat=max(1000,1000)+1*1000=2000
    let res = gcra(state, config, t, 1);
    expect((res.state as GCRAState).tat).toBe(2000);
    state = res.state as GCRAState;

    // Second request at same time: tat=2000, new_tat=max(1000,2000)+1*1000=3000
    res = gcra(state, config, t, 1);
    expect((res.state as GCRAState).tat).toBe(3000);
    state = res.state as GCRAState;

    // Third request at same time: tat=3000, new_tat=max(1000,3000)+1*1000=4000
    res = gcra(state, config, t, 1);
    expect((res.state as GCRAState).tat).toBe(4000);
  });

  test("cost parameter advances TAT by cost * interval milliseconds", () => {
    let state = createState();
    const t = 1000;

    // cost=2: new_tat = max(1000,1000) + 2*1000 = 3000
    const res = gcra(state, config, t, 2);

    expect(res.output.allowed).toBe(true);
    expect((res.state as GCRAState).tat).toBe(3000);
    // backlog = 3000 - 1000 = 2000
    // remaining = floor((2000 - 2000) / 1000) = 0
    expect(res.output.remaining).toBe(0);
  });

  test("allowAt threshold: now < allowAt leads to rejection", () => {
    let state = createState();
    const t = 1000;

    // Consume burst capacity
    for (let i = 0; i < 3; i++) {
      state = gcra(state, config, t, 1).state as GCRAState;
    }
    // After 3 requests: tat = 4000
    // burstTolerance = (3-1)*1000 = 2000
    // allowAt = 4000 - 2000 = 2000

    const res = gcra(state, config, t, 1);

    // now < allowAt? 1000 < 2000? YES -> reject
    expect(res.output.allowed).toBe(false);
    expect(res.output.retryAfter).toBe(1); // ceil((2000-1000)/1000) = 1
  });

  test("requests at interval spacing allow burst recovery", () => {
    let state = createState();
    const t = 1000;

    // Make request, tat = 2000, remaining = 1
    state = gcra(state, config, t, 1).state as GCRAState;

    // At t + interval: tat = max(2000, 2000) + 1000 = 3000
    const res = gcra(state, config, t + 1000, 1);

    // backlog = 3000 - 2000 = 1000
    // remaining = floor((2000 - 1000) / 1000) = 1
    expect(res.output.allowed).toBe(true);
    expect(res.output.remaining).toBe(1);
  });

  test("retryAfter = ceil((allowAt - now) / 1000)", () => {
    let state = createState();
    const t = 1000;

    // Consume all burst: tat = 4000, allowAt = 2000
    for (let i = 0; i < 3; i++) {
      state = gcra(state, config, t, 1).state as GCRAState;
    }

    // At t + 500ms: retryAfter = ceil((2000 - 1500) / 1000) = ceil(0.5) = 1
    const res1 = gcra(state, config, t + 500, 1);
    expect(res1.output.retryAfter).toBe(1);

    // At t + 999ms: retryAfter = ceil((2000 - 1999) / 1000) = ceil(0.001) = 1
    const res2 = gcra(state, config, t + 999, 1);
    expect(res2.output.retryAfter).toBe(1);

    // At t + 1001ms: retryAfter = ceil((2000 - 2001) / 1000) = 0 (but request allowed)
    const res3 = gcra(state, config, t + 1001, 1);
    expect(res3.output.allowed).toBe(true);
  });

  test("large time jumps allow reset to normal rate", () => {
    let state = createState();
    const t = 1000;

    // Consume burst at t=1000
    for (let i = 0; i < 3; i++) {
      state = gcra(state, config, t, 1).state as GCRAState;
    }
    // tat = 4000

    // Jump to t + 10000: now >> allowAt, so TAT resets to now
    // new_tat = max(11000, 4000) + 1*1000 = 12000
    const res = gcra(state, config, t + 10000, 1);

    expect(res.output.allowed).toBe(true);
    expect((res.state as GCRAState).tat).toBe(12000);
    // backlog = 12000 - 11000 = 1000
    // remaining = floor((2000 - 1000) / 1000) = 1
    expect(res.output.remaining).toBe(1);
  });

  test("backlog = new_tat - now tracks debt accumulated", () => {
    let state = createState();
    const t = 1000;

    // cost=1: tat=2000, backlog=2000-1000=1000, remaining=1
    let res = gcra(state, config, t, 1);
    expect(res.output.remaining).toBe(1);
    state = res.state as GCRAState;

    // cost=1 again: tat=3000, backlog=3000-1000=2000, remaining=0
    res = gcra(state, config, t, 1);
    expect(res.output.remaining).toBe(0);
    state = res.state as GCRAState;

    // cost=1 again: tat=4000, backlog=4000-1000=3000, remaining=-1 capped to 0
    res = gcra(state, config, t, 1);
    expect(res.output.remaining).toBe(0);
  });

  test("reset time always equals new TAT", () => {
    let state = createState();
    const t = 1000;

    let res = gcra(state, config, t, 1);
    const tat1 = (res.state as GCRAState).tat;
    expect(res.output.reset).toBe(tat1);

    state = res.state as GCRAState;
    res = gcra(state, config, t, 1);
    const tat2 = (res.state as GCRAState).tat;
    expect(res.output.reset).toBe(tat2);

    state = res.state as GCRAState;
    res = gcra(state, config, t + 1000, 2);
    const tat3 = (res.state as GCRAState).tat;
    expect(res.output.reset).toBe(tat3);
  });

  test("burst tolerance formula: (burst - 1) * interval", () => {
    // With burst=3, interval=1 (1000ms):
    // burstTolerance = (3 - 1) * 1000 = 2000ms

    let state = createState();
    const t = 1000;

    // After 3 requests at t=1000: tat=4000
    for (let i = 0; i < 3; i++) {
      state = gcra(state, config, t, 1).state as GCRAState;
    }

    // allowAt = 4000 - 2000 = 2000
    // At t=1000: 1000 < 2000, so reject
    // At t=2000: 2000 >= 2000, so allow
    const rejectRes = gcra(state, config, t, 1);
    expect(rejectRes.output.allowed).toBe(false);

    const allowRes = gcra(state, config, 2000, 1);
    expect(allowRes.output.allowed).toBe(true);
  });

  test("remaining = floor((burstTolerance - backlog) / interval)", () => {
    let state = createState();
    const t = 1000;

    // Request with cost=1.5 would test fractions, but cost must be integer
    // Instead, verify the floor behavior:

    // After 1 request: backlog=1000, remaining=floor((2000-1000)/1000)=1
    let res = gcra(state, config, t, 1);
    expect(res.output.remaining).toBe(Math.floor((2000 - 1000) / 1000));
    state = res.state as GCRAState;

    // After 2 requests: backlog=2000, remaining=floor((2000-2000)/1000)=0
    res = gcra(state, config, t, 1);
    expect(res.output.remaining).toBe(Math.floor((2000 - 2000) / 1000));
    state = res.state as GCRAState;

    // After 3 requests: backlog=3000, remaining=floor((2000-3000)/1000)=-1 capped to 0
    res = gcra(state, config, t, 1);
    expect(res.output.remaining).toBe(
      Math.max(0, Math.floor((2000 - 3000) / 1000)),
    );
  });
});
