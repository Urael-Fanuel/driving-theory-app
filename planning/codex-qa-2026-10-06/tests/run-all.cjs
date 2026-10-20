// One quality gate for every logic test in this folder (CODEX QA 2026-10-08: "exit code 0 alone is
// not a reliable gate"). A test counts as FAILED if it exits with a non-zero code, runs longer than
// TIMEOUT_MS, or prints FAIL / WRONG / TEST ERROR / AssertionError anywhere in its output.
// These are logic tests with fake players, network and storage; they do NOT replace a phone test.
// Run from anywhere:  node planning/codex-qa-2026-10-06/tests/run-all.cjs
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');

const TIMEOUT_MS = 120_000;
const BAD = /\bFAIL\b|\bWRONG\b|TEST ERROR|AssertionError/;
const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.cjs') && f !== path.basename(__filename)).sort();

let failed = 0;
for (const f of files) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8', timeout: TIMEOUT_MS });
  const out = (r.stdout || '') + (r.stderr || '');
  const ms = Date.now() - t0;
  const why = r.error && r.error.code === 'ETIMEDOUT' ? 'timed out'
    : r.status !== 0 ? 'exit code ' + r.status
    : BAD.test(out) ? 'failure in output'
    : null;
  if (why) failed++;
  console.log((why ? 'FAILED ' : 'passed ') + f.padEnd(28) + String(ms).padStart(6) + ' ms' + (why ? '   <- ' + why : ''));
  if (why) console.log(out.split('\n').filter(l => BAD.test(l) || /Error/.test(l)).slice(0, 8).map(l => '        ' + l.slice(0, 200)).join('\n'));
}
console.log(`\n${files.length - failed} of ${files.length} test files passed`);
process.exitCode = failed ? 1 : 0;
