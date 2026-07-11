#!/usr/bin/env node
// PreToolUse/Bash reminder (non-blocking): warn if `gh pr create` runs while the branch
// touches packages/*/src but no changeset file (committed or pending) has been added.
// Docs-only or internal-only changes may legitimately need no changeset, so this only warns.
const { execSync } = require('child_process');

let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  let cmd;
  try {
    cmd = JSON.parse(input).tool_input.command || '';
  } catch {
    return;
  }

  if (!/gh\s+pr\s+create\b/.test(cmd)) return;

  const run = (c) => {
    try {
      return execSync(c, { encoding: 'utf8' });
    } catch {
      return '';
    }
  };

  const diff = run('git diff --name-only master...HEAD -- packages');
  const touchesSrc = diff
    .split('\n')
    .some((f) => /^packages\/[^/]+\/(.*\/)?src\//.test(f));
  if (!touchesSrc) return;

  const isChangesetEntry = (f) => f && !/config\.json$|README\.md$/.test(f);
  const historyChangesets = run(
    'git diff --name-only master...HEAD -- .changeset',
  )
    .split('\n')
    .filter(isChangesetEntry);
  const worktreeChangesets = run('git status --porcelain -- .changeset')
    .split('\n')
    .filter(isChangesetEntry);

  if (historyChangesets.length === 0 && worktreeChangesets.length === 0) {
    console.log(
      JSON.stringify({
        systemMessage:
          'Reminder: this branch touches packages/*/src but no .changeset/*.md file was found. Add one (see the limitkit-release skill) unless this change genuinely needs no release note.',
      }),
    );
  }
});
