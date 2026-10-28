import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { pnpmInvocation, runCommand, runGroup, runtimeMetadata } from './run-browser.mjs';
import { createEnemyCoverage, enemyReportPath, enemySelection, enemyUnits } from '../enemy-browser-plan.mjs';

const suites = ['first', 'second', 'third'].map(id => ({ id, command: `test:${id}` }));
const metadata = { runId: '123', runAttempt: '2', commit: 'a'.repeat(40), node: process.version, playwright: 'fixture', chromium: null };
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'bincov-ci-timing-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return { group: 'batch-1', suites, reportPath: join(dir, 'timing/report.json'), summaryPath: join(dir, 'summary.md'), metadata, log: () => {} };
}
const node = (source, options) => runCommand(process.execPath, ['-e', source], { ...options, stdio: 'ignore' });
const stored = path => JSON.parse(readFileSync(path, 'utf8'));

test('real child successes are sequential and persist running evidence before execution', async t => {
  const f = fixture(t), visited = [];
  const report = await runGroup({ ...f, execute: async (suite, options) => {
    const current = stored(f.reportPath);
    assert.equal(current.status, 'running'); assert.equal(current.suites[visited.length].status, 'running');
    assert.equal(current.suites.filter(s => s.status === 'running').length, 1);
    assert.equal(current.suites.filter(s => s.status === 'passed').length, visited.length);
    visited.push(suite.id); return node('setTimeout(() => process.exit(0), 15)', options);
  } });
  assert.deepEqual(visited, suites.map(s => s.id)); assert.equal(report.status, 'passed'); assert.equal(report.exitCode, 0);
  assert.deepEqual(stored(f.reportPath), report); assert.equal(report.schemaVersion, 1);
  assert.ok(report.durationMs >= 0 && report.finishedAt);
  for (const row of report.suites) { assert.equal(row.status, 'passed'); assert.equal(row.exitCode, 0); assert.ok(row.durationMs >= 0 && row.startedAt && row.finishedAt); }
  assert.match(readFileSync(f.summaryPath, 'utf8'), /pnpm test:first.*passed/);
});

test('a real nonzero child stops remaining suites and records its exact exit code', async t => {
  const f = fixture(t);
  const report = await runGroup({ ...f, execute: (suite, options) => node(`process.exit(${suite.id === 'second' ? 7 : 0})`, options) });
  assert.equal(report.status, 'failed'); assert.equal(report.exitCode, 7);
  assert.deepEqual(report.suites.map(s => s.status), ['passed', 'failed', 'not_run']);
  assert.equal(report.suites[2].startedAt, null); assert.equal(report.suites[1].exitCode, 7);
});

test('enemy process success requires a fresh complete report and persists its coverage in the timing row', async t => {
  const f = fixture(t), suite = { id: 'enemy-720', command: 'test:enemy-720' };
  let data;
  const report = await runGroup({ ...f, suites: [suite], execute: async () => {
    const selection = enemySelection(['--shard=enemy-720']);
    data = { ...createEnemyCoverage(selection, metadata), finishedAt: new Date().toISOString(), status: 'passed', units: enemyUnits(selection) };
    return { exitCode: 0, signal: null };
  }, readCoverage: () => data });
  assert.equal(report.status, 'passed'); assert.deepEqual(stored(f.reportPath).suites[0].enemyCoverage, data);
  for (const bad of [undefined, { ...data, status: 'running' }, { ...data, startedAt: '2020-01-01T00:00:00.000Z' },
    { ...data, units: [] }, { ...data, commit: 'b'.repeat(40) }]) {
    const failed = await runGroup({ ...f, suites: [suite, suites[1]], execute: async () => ({ exitCode: 0, signal: null }), readCoverage: () => bad });
    assert.equal(failed.status, 'failed'); assert.equal(failed.exitCode, 1);
    assert.match(failed.suites[0].error, /Invalid enemy shard evidence/); assert.equal(failed.suites[1].status, 'not_run');
  }
});

test('default enemy report reader rejects a missing file after a zero-exit child', async t => {
  const f = fixture(t), previous = process.cwd();
  try {
    mkdirSync(dirname(f.reportPath), { recursive: true });
    process.chdir(dirname(f.reportPath));
    const report = await runGroup({ ...f, suites: [{ id: 'enemy-720', command: 'test:enemy-720' }],
      execute: async () => ({ exitCode: 0, signal: null }) });
    assert.equal(report.status, 'failed'); assert.match(report.suites[0].error, /ENOENT/);
    const path = enemyReportPath('enemy-720'); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, '{invalid');
    const malformed = await runGroup({ ...f, suites: [{ id: 'enemy-720', command: 'test:enemy-720' }],
      execute: async () => ({ exitCode: 0, signal: null }) });
    assert.equal(malformed.status, 'failed'); assert.match(malformed.suites[0].error, /Invalid enemy shard evidence/);
  } finally { process.chdir(previous); }
});

test('spawn errors fail closed and leave later suites not_run', async t => {
  const f = fixture(t);
  const report = await runGroup({ ...f, execute: (_, options) => runCommand(join(dirname(f.reportPath), 'nonexistent-command'), [], { ...options, stdio: 'ignore' }) });
  assert.equal(report.status, 'failed'); assert.notEqual(report.exitCode, 0);
  assert.match(report.suites[0].error, /ENOENT/); assert.deepEqual(report.suites.map(s => s.status), ['failed', 'not_run', 'not_run']);
});

test('real child signal termination cannot masquerade as success', async t => {
  const f = fixture(t);
  const report = await runGroup({ ...f, execute: (_, options) => node("process.kill(process.pid, 'SIGTERM')", options) });
  assert.notEqual(report.exitCode, 0); assert.notEqual(report.suites[0].status, 'passed');
  assert.deepEqual(report.suites.slice(1).map(s => s.status), ['not_run', 'not_run']);
  if (process.platform !== 'win32') assert.equal(report.suites[0].signal, 'SIGTERM');
});

test('aborting a live child preserves interruption and writes a complete final report', async t => {
  const f = fixture(t), controller = new AbortController();
  const report = await runGroup({ ...f, signal: controller.signal, execute: async (_, options) => {
    const result = node('setInterval(() => {}, 1000)', options);
    setTimeout(() => controller.abort('SIGINT'), 100);
    return result;
  } });
  assert.equal(report.status, 'interrupted'); assert.equal(report.signal, 'SIGINT'); assert.equal(report.exitCode, 130);
  assert.equal(report.suites[0].status, 'interrupted'); assert.equal(report.suites[0].signal, 'SIGINT');
  assert.deepEqual(report.suites.slice(1).map(s => s.status), ['not_run', 'not_run']);
  assert.deepEqual(stored(f.reportPath), report);
});

test('a hanging real child times out and stops the group', async t => {
  const f = fixture(t);
  const report = await runGroup({ ...f, timeoutMs: 100, execute: (_, options) => node('setInterval(() => {}, 1000)', options) });
  assert.equal(report.status, 'failed'); assert.equal(report.suites[0].status, 'failed'); assert.equal(report.suites[0].timedOut, true); assert.notEqual(report.exitCode, 0);
  assert.deepEqual(report.suites.slice(1).map(s => s.status), ['not_run', 'not_run']);
});

test('missing results and thrown executors fail closed; pre-aborted groups execute nothing', async t => {
  for (const execute of [async () => undefined, async () => { throw new Error('fixture failure'); }]) {
    const report = await runGroup({ ...fixture(t), execute });
    assert.equal(report.status, 'failed'); assert.equal(report.exitCode, 1);
    assert.deepEqual(report.suites.map(s => s.status), ['failed', 'not_run', 'not_run']);
  }
  const controller = new AbortController(); controller.abort('SIGTERM');
  const report = await runGroup({ ...fixture(t), signal: controller.signal, execute: () => { throw new Error('must not execute'); } });
  assert.equal(report.status, 'interrupted'); assert.equal(report.exitCode, 143); assert.ok(report.suites.every(s => s.status === 'not_run'));
});

test('invalid selection and unsafe commands fail before execution', async t => {
  const f = fixture(t);
  for (const override of [{ group: 'unknown' }, { suites: [] }, { suites: [suites[0], suites[0]] }, { suites: [{ id: 'first', command: 'test:first && echo unsafe' }] }]) {
    await assert.rejects(runGroup({ ...f, ...override, execute: () => { throw new Error('must not execute'); } }));
  }
  assert.equal(existsSync(f.reportPath), false);
  assert.throws(() => pnpmInvocation('test:first;echo unsafe'));
  const child = spawnSync(process.execPath, ['scripts/ci/run-browser.mjs', 'unknown'], { encoding: 'utf8' });
  assert.notEqual(child.status, 0); assert.match(child.stderr, /Usage:/);
});

test('runtime metadata reads installed versions without exposing environment secrets', () => {
  const result = runtimeMetadata({ GITHUB_RUN_ID: '42', GITHUB_RUN_ATTEMPT: '3', GITHUB_SHA: 'b'.repeat(40), TOKEN: 'do-not-record' });
  assert.equal(result.runId, '42'); assert.equal(result.runAttempt, '3'); assert.equal(result.node, process.version);
  assert.match(result.playwright, /^\d+\.\d+\./); assert.match(result.chromium.browserVersion, /^\d+\./);
  assert.ok(result.cpu.count >= 1); assert.equal(typeof result.cpu.model, 'string'); assert.equal(result.renderer, null);
  assert.equal(runtimeMetadata({ BINCOV_RENDERER: 'ANGLE (Mesa, Vulkan 1.4 (llvmpipe))' }).renderer, 'ANGLE (Mesa, Vulkan 1.4 (llvmpipe))');
  assert.equal(JSON.stringify(result).includes('do-not-record'), false);
});

test('Windows pnpm resolves its Node CLI without passing shell metacharacters through a shell', t => {
  const f = fixture(t), directory = join(dirname(f.reportPath), 'pnpm & fixture'), cli = join(directory, 'node_modules/pnpm/bin/pnpm.cjs');
  mkdirSync(dirname(cli), { recursive: true }); writeFileSync(cli, '// fixture, never executed');
  const invocation = pnpmInvocation('test:first', { platform: 'win32', env: { PATH: directory } });
  assert.equal(invocation.file, process.execPath); assert.deepEqual(invocation.args, [cli, 'test:first']);
  assert.throws(() => pnpmInvocation('test:first', { platform: 'win32', env: { PATH: join(directory, 'missing') } }), /Cannot locate/);
});

test('report or summary write failures reject instead of returning a successful group', async t => {
  const f = fixture(t); mkdirSync(f.reportPath, { recursive: true });
  let executed = false;
  await assert.rejects(runGroup({ ...f, execute: async () => { executed = true; return { exitCode: 0, signal: null }; } }));
  assert.equal(executed, false);
  const g = fixture(t); mkdirSync(g.summaryPath);
  await assert.rejects(runGroup({ ...g, execute: async () => ({ exitCode: 0, signal: null }) }));
});
