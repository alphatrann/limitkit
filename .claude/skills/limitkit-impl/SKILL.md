---
name: limitkit-impl
description: Implement a planned LimitKit change — code, tests, docs, build, Docker-backed test services, and bugfixing. Use after a plan/issue exists (from limitkit-plan) or when given direct implementation instructions.
---

# limitkit-impl

Implementation workflow for the LimitKit monorepo. Assumes a plan already exists (a GitHub issue from `limitkit-plan`, or direct instructions from the user). This skill does not create changesets, commit, or push — that's `limitkit-release`.

## 1. Load context

If an issue number was given, `gh issue view <n>` first so the implementation matches the agreed design rather than re-deriving it.

## 2. Follow repo conventions (`CONTRIBUTING.md`)

- Kebab-case file/folder names.
- Strict TypeScript, avoid `any`, prefer interfaces for public APIs.
- JSDoc on public API surface.
- New algorithm → implement `Algorithm<TConfig>` (with `validate()`), plus `InMemoryCompatible<TState>` (`process(state, now, cost)`) and/or `RedisCompatible` (`luaScript`, `getLuaArgs`) as the plan requires.
- New store → implement `Store` (`consume(key, algorithm, now, cost)`). If it's a second durable store next to Postgres/Redis, reuse the pure reducer kernel in `packages/core/src/algorithms` rather than re-deriving per-algorithm logic (this is the pattern established for `@limitkit/postgres`).

## 3. Place tests per the existing layout

- `core`, `stores/*`, `adapters/express`, `adapters/http`: colocated `__tests__/` next to `src/`.
- `adapters/nest`: unit/integration tests live next to the file they test (e.g. `guards/limit.guard.test.ts`); e2e tests go in the dedicated `libs/limit/tests/` tree.

## 4. Docker-backed tests

Redis and Postgres store/adapter tests need the shared containers in `compose.test.yml` (both services define a healthcheck, so `--wait` blocks until they're actually ready, not just started):

```
docker compose -f compose.test.yml up -d --wait
```

These packages' `test` scripts already run `jest --runInBand` (see `packages/stores/redis` and `packages/stores/postgres` `package.json`) because tests share live container state — don't parallelize them yourself or drop `--runInBand` if you add new test files there. A `.claude/hooks` PreToolUse hook does this automatically before store test runs, so you usually don't need to run it by hand.

## 5. Lint / typecheck / build / test loop

Every edit to a `.ts`/`.js` file is auto-formatted and auto-fixed on save by a PostToolUse hook (Prettier + `eslint --fix`), so most style issues never reach this step. Still confirm at the monorepo root before calling it done:

```
yarn workspace @limitkit/<pkg> test   # fast inner loop
yarn lint            # eslint . (repo-wide, not per-package)
yarn typecheck        # turbo run typecheck
yarn build            # turbo run build (all packages, cached)
yarn test             # turbo run test
```

`yarn lint` treats `@typescript-eslint/no-explicit-any` as a warning, not an error — acceptable for generic client/store interfaces, don't chase it to zero. Fix real failures and re-run rather than working around them (no skipping tests, no `--no-verify`-style shortcuts, no widening an ESLint rule to silence a genuine finding).

## 6. Update docs if behavior or public API changed

- Package-level README if one exists.
- Root `README.md` if it documents the surface you changed.
- `CONTRIBUTING.md` if you introduced a new algorithm/store pattern worth documenting for future contributors.
- `ROADMAP.md` — move the item out of "Planned"/"Under consideration" if this finishes it.

## 7. Clean up

Stop the Docker containers if you started them and the user doesn't need them kept running for further manual testing:

```
docker compose -f compose.test.yml down
```

## 8. Handoff

Once build, typecheck, and tests are all green, hand off to `limitkit-release` for the changeset/PR flow. Don't commit or push from this skill.
