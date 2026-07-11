#!/usr/bin/env node
// PostToolUse/Edit|Write: format + autofix the file that was just touched, so every edit
// stays compliant with this repo's Prettier/ESLint config without a separate manual step.
// Never blocks - only reports issues ESLint could not fix automatically.
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    return;
  }

  const filePath =
    payload.tool_input?.file_path || payload.tool_response?.filePath;
  if (!filePath) return;

  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const projectDirResolved = path.resolve(projectDir).toLowerCase();
  const filePathResolved = path.resolve(filePath).toLowerCase();
  if (!filePathResolved.startsWith(projectDirResolved)) return;
  if (/[\\/](node_modules|dist|\.turbo|coverage)[\\/]/.test(filePathResolved))
    return;
  if (!fs.existsSync(filePath)) return;

  const prettierBin = path.join(
    projectDir,
    'node_modules',
    'prettier',
    'bin',
    'prettier.cjs',
  );
  const eslintBin = path.join(
    projectDir,
    'node_modules',
    'eslint',
    'bin',
    'eslint.js',
  );

  const prettierExts = [
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.json',
    '.md',
    '.yml',
    '.yaml',
  ];
  const lintExts = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
  const ext = path.extname(filePath);

  const messages = [];

  if (prettierExts.includes(ext) && fs.existsSync(prettierBin)) {
    try {
      execFileSync('node', [prettierBin, '--write', filePath], {
        stdio: 'pipe',
      });
    } catch (e) {
      const detail = (e.stderr || e.message || '').toString().split('\n')[0];
      messages.push(`prettier could not format ${filePath}: ${detail}`);
    }
  }

  if (lintExts.includes(ext) && fs.existsSync(eslintBin)) {
    try {
      execFileSync('node', [eslintBin, '--fix', filePath], { stdio: 'pipe' });
    } catch (e) {
      // eslint exits non-zero when unfixed issues remain - surface them, don't block the edit.
      const out = (e.stdout || '').toString().trim();
      if (out) messages.push(out);
    }
  }

  if (messages.length > 0) {
    console.log(JSON.stringify({ systemMessage: messages.join('\n\n') }));
  }
});
