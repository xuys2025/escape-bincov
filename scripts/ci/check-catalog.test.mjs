import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { checksFrom, diagnosticChecks, planFor, risks } from '../check-catalog.mjs';
import { scriptInventory } from '../script-inventory.mjs';
import { allSuiteIds, browserGroups, manualSuites, suitesForGroup } from './browser-suites.mjs';

const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts;
const checks = checksFrom(scripts);
const files = readdirSync('scripts', { recursive: true }).map(path => `scripts/${path.replaceAll('\\', '/')}`)
  .filter(path => /\.(mjs|js|ts|py|sh)$/.test(path));
const cli = (...args) => spawnSync(process.execPath, ['scripts/checks.mjs', ...args], { encoding: 'utf8' });

test('all package checks have metadata and retain their actual command and CI ownership', () => {
  const expected = Object.keys(scripts).filter(id => id === 'test' || id === 'package' || /^(test|check|diagnose):/.test(id));
  assert.deepEqual(checks.map(c => c.id).sort(), expected.sort());
  assert.equal(new Set(checks.map(c => c.id)).size, checks.length);
  for (const check of checks) assert.equal(check.script, scripts[check.id]);
  assert.match(readFileSync('.github/workflows/ci-pages.yml', 'utf8'), /name: CI selection and coverage safeguards\s+run: pnpm check:ci/);
  assert.equal(scripts['check:ci'], 'node --test scripts/ci/*.test.mjs', 'the full existing CI guard glob is preserved');
  assert.deepEqual(checks.filter(c => c.ci?.startsWith('batch-')).map(c => c.id.slice(5)).sort(), [...allSuiteIds].sort());
  for (const group of browserGroups) for (const suite of suitesForGroup(group)) {
    assert.equal(checks.find(c => c.id === suite.command)?.ci, group);
  }
  for (const suite of manualSuites) assert.equal(checks.find(c => c.id === suite.command)?.manualReason, suite.reason);
  assert.throws(() => checksFrom({ ...scripts, 'test:forgotten': 'node scripts/forgotten.mjs' }), /Missing check description/);
  const missing = { ...scripts }; delete missing['diagnose:f20'];
  assert.throws(() => checksFrom(missing), /Missing package command/);
});

test('risk unions preserve save/input gates, baseline order, prerequisites and human evidence', () => {
  const plan = planFor(['save', 'input', 'migration'], checks);
  const ids = plan.checks.map(c => c.id);
  assert.deepEqual(ids.slice(0, 2), ['test', 'package']);
  for (const id of ['test:save-browser', 'test:browser', 'test:ui', 'test:title', 'test:desktop-input', 'test:mobile', 'test:mobile-ux', 'test:expansion']) assert.ok(ids.includes(id), id);
  assert.equal(new Set(ids).size, ids.length);
  assert.match(plan.checks.find(c => c.id === 'test:expansion').prerequisites.join(' '), /pre-m0\.html.*pre-perk\.html.*pre-enemy\.html.*pre-gunsmith\.html/);
  assert.match(plan.checks.find(c => c.id === 'test:mobile-ux').prerequisites.join(' '), /未设置时不会运行/);
  assert.ok(plan.evidence.some(text => text.includes('真机')));
  assert.ok(plan.evidence.some(text => text.includes('多窗口')));
  assert.throws(() => planFor(['savee'], checks), /Unknown risk/);
  assert.throws(() => planFor(['__proto__'], checks), /Unknown risk/);
  assert.throws(() => planFor([], checks), /at least one/);
  assert.throws(() => planFor(['docs', 'save'], checks), /documentation-only/);
  assert.deepEqual(planFor(['docs'], checks).checks, []);
});

test('every profile resolves and diagnostics cannot become required regression gates', () => {
  for (const id of Object.keys(risks)) {
    const plan = planFor([id], checks);
    assert.ok(plan.checks.every(c => c.kind !== 'diagnostic'), id);
    if (id !== 'docs') assert.deepEqual(plan.checks.slice(0, 2).map(c => c.id), ['test', 'package']);
  }
  const render = planFor(['render'], checks);
  assert.deepEqual(render.diagnostics.map(c => c.id), Object.keys(diagnosticChecks));
  assert.match(render.diagnostics[0].evidence, /exit 0.*PARTIAL/);
  assert.ok(planFor(['combat'], checks).checks.some(c => c.id === 'test:play'));
  assert.ok(planFor(['layered'], checks).checks.some(c => c.id === 'test:layered-play'));
  assert.ok(planFor(['base'], checks).checks.some(c => c.id === 'check:perk-ui'));
});

test('all script files are classified; unknown and stale entries fail without deleting legacy tools', () => {
  const inventory = scriptInventory(files, scripts);
  assert.equal(inventory.length, files.length);
  assert.ok(inventory.some(item => item.kind === 'review'));
  assert.equal(inventory.find(item => item.path === 'scripts/sol-r6-audio-controls.mjs').kind, 'archive');
  assert.equal(inventory.find(item => item.path === 'scripts/coast-sample-heap.mjs').kind, 'diagnostic');
  assert.throws(() => scriptInventory([...files, 'scripts/unregistered-probe.mjs'], scripts), /Unclassified script/);
  assert.throws(() => scriptInventory(files.filter(p => p !== 'scripts/sol-r6-audio-controls.mjs'), scripts), /Stale script/);
  assert.throws(() => scriptInventory(files, { ...scripts, future: 'node scripts/missing.mjs' }), /Missing package entry/);
});

test('the live heap scripts use distinct registered outputs and preserve explicit overrides', () => {
  assert.equal(new Set(Object.values(diagnosticChecks).map(c => c.output)).size, 3);
  for (const [id, file, env] of [
    ['diagnose:coast-heap', 'coast-sample-heap.mjs', 'BINCOV_HEAP_OUT'],
    ['diagnose:coast-owners', 'sol-r6-heap.mjs', 'BINCOV_HEAP_OUT'],
    ['diagnose:f20', 'astra-r7-f20.mjs', 'R7_OUT'],
  ]) {
    const source = readFileSync(`scripts/${file}`, 'utf8').replaceAll(/\s/g, '');
    assert.ok(source.includes(`process.env.${env}||diagnosticChecks['${id}'].output`), file);
  }
});

test('CLI returns parseable plans and rejects typos or filters that could hide required checks', () => {
  const result = cli('--risk=save,input', '--json');
  assert.equal(result.status, 0, result.stderr);
  assert.ok(JSON.parse(result.stdout).checks.some(c => c.id === 'test:save-browser'));
  assert.equal(cli('--list', '--json').status, 0);
  const archive = cli('--scripts', '--kind=archive', '--json');
  assert.equal(archive.status, 0, archive.stderr);
  assert.ok(JSON.parse(archive.stdout).scripts.every(s => s.kind === 'archive'));
  for (const args of [['--risk=svae'], ['--risk='], ['--risk=save,'], ['--risk=save', '--kind=regression'], ['--scripts', '--kind=archve'], ['--run'], ['--risk=docs,save']]) {
    const failed = cli(...args); assert.equal(failed.status, 1, `${args}: ${failed.stdout}`); assert.equal(failed.stdout, '');
  }
});
