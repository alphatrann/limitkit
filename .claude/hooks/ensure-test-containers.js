#!/usr/bin/env node
// PreToolUse/Bash: redis/postgres store tests need the shared containers from
// compose.test.yml (jest --runInBand relies on them being up). Auto-start if missing
// rather than letting the test run fail with a connection error.
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

  const looksLikeTest =
    /\bjest\b/.test(cmd) || /\byarn\s+(test|workspace)\b/.test(cmd);
  const touchesDockerStore =
    /stores[\\/]redis|stores[\\/]postgres|@limitkit\/redis|@limitkit\/postgres/.test(
      cmd,
    );
  if (!looksLikeTest || !touchesDockerStore) return;

  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const composeFile = `${projectDir}/compose.test.yml`;

  // redis/postgres both define a healthcheck, so `--wait` blocks until they're actually
  // ready to accept connections (not just "process started") and is a no-op if already up.
  try {
    execSync(`docker compose -f "${composeFile}" up -d --wait`, {
      encoding: 'utf8',
    });
  } catch (e) {
    const detail = (e.stderr || e.message || '')
      .toString()
      .split('\n')
      .slice(0, 3)
      .join(' ');
    console.log(
      JSON.stringify({
        systemMessage: `Docker test containers (compose.test.yml) are not ready and auto-start failed: ${detail}. Run \`docker compose -f compose.test.yml up -d --wait\` manually before this test - check for a port conflict on 6379/5432 with another local service.`,
      }),
    );
  }
});
