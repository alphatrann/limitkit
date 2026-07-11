#!/usr/bin/env node
// PreToolUse/Bash guard: force-push, hard-reset, and hook/signature bypasses require
// the user's direct request, not an automatic tool call.
let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  let cmd;
  try {
    cmd = JSON.parse(input).tool_input.command || '';
  } catch {
    return;
  }

  // Strip heredoc bodies and quoted-string contents before scanning for dangerous flags,
  // so a commit message that merely *mentions* --no-verify (e.g. describing this very
  // hook) doesn't get mistaken for the actual flag.
  const scan = cmd
    .replace(/<<-?\s*(['"]?)(\w+)\1[\s\S]*?\n\2\b/g, '')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");

  let reason = null;
  if (
    /git\s+push\b/.test(scan) &&
    (/--force\b/.test(scan) || /(^|\s)-f(\s|$)/.test(scan))
  ) {
    reason =
      'Force push (including --force-with-lease) is blocked by a safety hook. Ask the user to run this manually if it is really needed.';
  } else if (/git\s+reset\s+--hard/.test(scan)) {
    reason =
      'git reset --hard is blocked by a safety hook (it discards uncommitted work). Ask the user to run it manually if truly needed.';
  } else if (
    /git\s+commit\b/.test(scan) &&
    /(--no-verify|--no-gpg-sign)/.test(scan)
  ) {
    reason =
      'Skipping commit hooks or signing (--no-verify/--no-gpg-sign) is blocked. Ask the user to run it manually if truly needed.';
  }

  if (reason) {
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: reason,
        },
      }),
    );
  }
});
