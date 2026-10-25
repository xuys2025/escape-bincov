import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { parseTrendRounds } from '../station-resource-args.mjs';

const cli = (args, out, missingHtml) => spawnSync(process.execPath,
  ['--import', 'tsx', 'scripts/station-resource-trend.mjs', `--out=${out}`, `--html=${missingHtml}`, ...args],
  { encoding: 'utf8', timeout: 30000 });

test('trend rounds keep the default and valid positive integer workloads', () => {
  assert.equal(parseTrendRounds([]), 60);
  assert.equal(parseTrendRounds(['--mode=shared', '--snapshots']), 60);
  for (const value of ['1', '30', '60', '120', '1e2', String(Number.MAX_SAFE_INTEGER)]) {
    assert.equal(parseTrendRounds([`--rounds=${value}`]), Number(value));
  }
});

test('the real trend CLI rejects invalid rounds before output creation, HTML loading or browser startup', () => {
  const root = mkdtempSync(join(tmpdir(), 'bincov-trend-invalid-'));
  try {
    const invalid = ['NaN', 'Infinity', '-Infinity', '', ' ', 'abc', '1.5', '0', '-1', '9007199254740992'];
    const cases = [...invalid.map(value => [`--rounds=${value}`]), ['--rounds'], ['--rounds', '--snapshots'], ['--rounds=1', '--rounds=2']];
    for (const [i, args] of cases.entries()) {
      const out = join(root, `output-${i}`), missingHtml = join(root, 'missing-game.html');
      const result = cli(args, out, missingHtml);
      assert.equal(result.status, 1, `${args}: ${result.error ?? result.stderr}`);
      assert.match(result.stderr, /Invalid --rounds:/, `${args}: must fail parsing, not loading HTML or Chromium`);
      assert.equal(result.stdout, '');
      assert.equal(existsSync(out), false, `${args}: rejected arguments must not create an evidence directory`);
    }
    assert.deepEqual(readdirSync(root), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the real trend CLI accepts default and legal rounds before the existing HTML prerequisite', () => {
  const root = mkdtempSync(join(tmpdir(), 'bincov-trend-valid-'));
  try {
    for (const [i, args] of [[], ['--rounds=1'], ['--rounds=60'], ['--rounds=120']].entries()) {
      const out = join(root, `output-${i}`), missingHtml = join(root, 'missing-game.html');
      const result = cli(args, out, missingHtml);
      assert.equal(result.status, 1, `${args}: ${result.error ?? result.stderr}`);
      assert.match(result.stderr, /ENOENT/);
      assert.ok(result.stderr.includes(missingHtml));
      assert.equal(existsSync(out), true);
      assert.deepEqual(readdirSync(out), [], 'HTML prerequisite fails before any browser or evidence report');
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
