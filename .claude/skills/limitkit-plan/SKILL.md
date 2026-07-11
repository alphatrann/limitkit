---
name: limitkit-plan
description: Turn on plan mode, explore the LimitKit monorepo, weigh architectural options, and file the resulting implementation plan as a GitHub issue. Use before writing code for a new algorithm, store, adapter, or any non-trivial change to LimitKit.
---

# limitkit-plan

Planning workflow for the LimitKit monorepo (`packages/core`, `packages/stores/*`, `packages/adapters/*`). Produces a reviewed plan and a GitHub issue — no code changes.

## 1. Enter plan mode

If not already in plan mode, call `EnterPlanMode` before exploring. Nothing in this skill should edit files.

## 2. Explore before proposing anything

Ground the plan in what actually exists, not assumptions:

- Read `ROADMAP.md` — check whether the request is already scoped there (Planned / Under consideration / Not planned). If it's an item already described there, reuse its stated design rather than re-deriving it, and note any deltas.
- Read `CONTRIBUTING.md` for the interfaces new code must satisfy:
  - Algorithms implement `Algorithm<TConfig>`; add `InMemoryCompatible<TState>` (`process(state, now, cost)`) for in-memory execution and/or `RedisCompatible` (`luaScript`, `getLuaArgs`) for Redis execution.
  - Stores implement `Store` (`consume(key, algorithm, now, cost)`).
- Look at the closest prior art for a similar change (e.g. `packages/stores/postgres` for a new store, `packages/adapters/express` for a new adapter) to match its shape — check its `src/` layout, `__tests__/` layout, and `package.json` scripts.
- Check `packages/core/src/algorithms` if the change touches an algorithm, since `@limitkit/core` holds the shared pure reducer kernel that both memory and durable stores reuse (established in the Postgres store work — see `.changeset/add-postgres-store.md` for the precedent).

Use the `Explore` agent or `Grep`/`Glob` directly for this — don't guess at file locations.

## 3. Propose the architecture

Cover, concretely:

- **Which package(s)** are new vs. modified (new `packages/stores/<name>` or `packages/adapters/<name>`, or changes inside `core`).
- **Atomicity/consistency approach**, if a store: per-algorithm strategy (e.g. single `INSERT ... ON CONFLICT DO UPDATE` for fixed/sliding-window-counter, `SELECT ... FOR UPDATE` for token bucket/GCRA, one-row-per-request for sliding window exact log — mirror the reasoning in `ROADMAP.md`'s Postgres section for the specific algorithm involved).
- **Public API surface** and whether it's a breaking change (affects changeset bump level later).
- **Test plan**: where tests live per `CONTRIBUTING.md`'s conventions, and whether the package needs the shared Docker containers in `compose.test.yml` (Redis/Postgres-backed packages run `jest --runInBand` because containers are shared state).
- **Docs to update**: package README, root `README.md`, `CONTRIBUTING.md` if a new interface pattern is introduced, `ROADMAP.md` to move/close the relevant item.

## 4. Get the plan approved

Call `ExitPlanMode` with the plan before doing anything else. Do not file an issue on an unapproved plan.

## 5. File the plan as a GitHub issue

Once approved:

- Prefer `gh issue create` (the `gh` CLI is already authenticated in this environment). Fall back to `mcp__github__create_issue` only if `gh` is unavailable.
- Title style matches merged PR titles in this repo, e.g. `feat: add PostgreSQL store (@limitkit/postgres)`.
- Apply existing labels where they fit: `enhancement`, `bug`, `documentation`, `good first issue`, `help wanted` (see `gh label list` for the full set — don't invent new labels).
- Body structure: Motivation, Design (the architecture from step 3), Files touched, Test plan, Open questions.
- If the item came from `ROADMAP.md`, link/quote the relevant section instead of duplicating it.

Creating an issue is visible to others — confirm the title/body with the user before running the create command, unless they've already explicitly approved filing it as part of approving the plan.
