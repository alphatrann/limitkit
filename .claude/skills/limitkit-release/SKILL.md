---
name: limitkit-release
description: Ship a finished LimitKit change - add a changeset, commit, push, and draft a PR. Use once limitkit-impl's build/typecheck/test loop is green and the change is ready to go out for review.
---

# limitkit-release

Release workflow for the LimitKit monorepo. Assumes code and tests are already done (via `limitkit-impl` or otherwise) and green.

## 1. Sanity check before touching git

- `git status` — review exactly what's staged/unstaged/untracked. Don't blindly `git add -A`.
- If there's any doubt the change is green, re-run `yarn lint && yarn typecheck && yarn build && yarn test` before proceeding — `.github/workflows/ci.yml` runs this same sequence (plus `compose.test.yml` for the Redis/Postgres tests) on every PR, so a green local run avoids surprises after pushing.

## 2. Add a changeset

This repo uses `@changesets/cli` (`.changeset/config.json`, `baseBranch: master`). The interactive `yarn changeset` prompt isn't scriptable here, so write the file directly in `.changeset/`, following the existing format (see `.changeset/add-postgres-store.md` for a real example):

```markdown
---
'@limitkit/<pkg>': <bump>
'@limitkit/<other-affected-pkg>': <bump>
---

<Prose summary: what changed and why, one paragraph. Mention any internal
refactor that keeps behavior identical across stores, if relevant.>
```

- Only list packages that are actually published (check the package isn't `"private": true` — e.g. the Nest e2e test app under `packages/adapters/nest` is internal-only and shouldn't get a changeset entry).
- Bump level per semver via changesets convention: new backwards-compatible feature → `minor`; bug fix → `patch`; breaking public API change → `major`. A package whose internals moved but whose public behavior is unchanged (e.g. `@limitkit/memory` when the reducer kernel was extracted for the Postgres store) still gets a `patch` bump since it shipped in the same release.
- Filename: short kebab-case description of the change (matches `add-postgres-store.md` style).

## 3. Commit

Use the conventional prefixes already used in this repo's history: `feat:`, `fix:`, `docs:`, `test:`, `chore:`. Stage specific files, not `-A`. Confirm the diff and commit message with the user before committing if this wasn't already implied by them asking to ship — committing is fine to do directly once asked to release, but pushing and opening a PR are visible to others and should be confirmed first.

## 4. Push and open a PR

```
git push -u origin <branch>
gh pr create --title "..." --body "..."
```

- Follow the branch-per-feature → PR → merge pattern already used in this repo's history (`git log`/`gh pr list` shows e.g. `feat/postgres-store`, `release/redis-client-compat`).
- PR body: Summary bullets + a Test plan checklist (build/typecheck/test, plus manual Docker-backed verification if a store/adapter was touched).
- Fall back to `mcp__github__create_pull_request` only if `gh` is unavailable.
- Never force-push, never merge the PR yourself, never skip hooks (`--no-verify`) — surface failures instead of bypassing them.

## 5. Changelog note: two different steps, don't conflate them

- **This feature PR** only needs the changeset _file_ added in step 2 — that's the changelog entry-in-waiting.
- **Actually bumping versions and writing `CHANGELOG.md`** happens via `yarn changeset` → `yarn version-packages` (`changeset version`), which is a separate release step run once changesets have accumulated on `master` (typically its own "Version Packages" commit/PR). Don't run `version-packages` as part of a routine feature PR unless the user is explicitly cutting a release right now.
