#!/usr/bin/env node
// PreToolUse/Bash guard: this repo's entire history lands via feature branch + merged PR
// (see git log) - never a direct push to master/main. Blocks that specific case only;
// pushes to any other branch name are left untouched.
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

  const m = cmd.match(/git\s+push\b([^;&|\n]*)/);
  if (!m) return;

  const args = m[1].trim().split(/\s+/).filter(Boolean);
  const nonFlagArgs = args.filter(
    (a) =>
      a !== 'origin' &&
      a !== '-u' &&
      a !== '--set-upstream' &&
      !a.startsWith('--set-upstream='),
  );

  let branch = null;
  const explicit = nonFlagArgs.find(
    (a) =>
      a === 'master' ||
      a === 'main' ||
      a === 'refs/heads/master' ||
      a === 'refs/heads/main',
  );
  if (explicit) {
    branch = explicit.replace('refs/heads/', '');
  } else if (nonFlagArgs.length === 0) {
    // Bare `git push` / `git push origin`: pushes the current branch upstream.
    try {
      const current = execSync('git branch --show-current', {
        encoding: 'utf8',
      }).trim();
      if (current === 'master' || current === 'main') branch = current;
    } catch {
      // not a git repo / git unavailable - nothing to block
    }
  }

  if (branch) {
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `Direct push to ${branch} is blocked - every recent change in this repo landed via a merged PR from a feature branch. Push a feature branch and open a PR instead.`,
        },
      }),
    );
  }
});
