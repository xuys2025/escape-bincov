import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { browserGroups, suitesForGroup } from './browser-suites.mjs';
import { selectTimingReports, validateTimingReports, verifyTimings } from './verify-timings.mjs';
import { createEnemyCoverage, enemySelection, enemyShardIds, enemyUnits } from '../enemy-browser-plan.mjs';

const identity = { runId: '123456', runAttempt: '2', commit: 'a'.repeat(40) };
const env = { GITHUB_RUN_ID: identity.runId, GITHUB_RUN_ATTEMPT: identity.runAttempt, GITHUB_SHA: identity.commit };
const iso = offset => new Date(Date.UTC(2026, 9, 15) + offset).toISOString();
const records = () => browserGroups.map(group => {
  const suites = suitesForGroup(group).map((suite, i) => ({ ...suite, status: 'passed', exitCode: 0, signal: null,
    startedAt: iso(i * 1000), finishedAt: iso((i + 1) * 1000), durationMs: 1000,
    ...(enemyShardIds.includes(suite.id) ? { enemyCoverage: enemyCoverage(suite.id, identity, iso(i * 1000), iso((i + 1) * 1000)) } : {}) }));
  return { schemaVersion: 1, group, ...identity, status: 'passed', exitCode: 0, signal: null, startedAt: iso(0),
    finishedAt: iso(suites.length * 1000), durationMs: suites.length * 1000, suites };
});

function enemyCoverage(id, metadata, startedAt, finishedAt) {
  const selection = enemySelection([`--shard=${id}`]);
  return { ...createEnemyCoverage(selection, metadata, startedAt), finishedAt, status: 'passed', units: enemyUnits(selection) };
}

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'bincov-ci-timing-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const directory = join(root, 'test-results', 'ci-timing');
  mkdirSync(directory, { recursive: true });
  const reports = records();
  const save = () => { for (const report of reports) writeFileSync(join(directory, `${report.group}-attempt-${report.runAttempt}.json`), JSON.stringify(report)); };
  save();
  return { root, directory, reports, save };
}

test('all current-run groups and exact suites validate and produce a complete timing summary', t => {
  const f = fixture(t), summaryPath = join(f.root, 'summary.md');
  const result = verifyTimings({ directory: f.directory, env, summaryPath });
  assert.equal(result.reports.length, 8);
  const suites = browserGroups.flatMap(suitesForGroup);
  assert.equal(suites.length, 45);
  for (const suite of suites) assert.ok(result.summary.includes(`pnpm ${suite.command}`), suite.id);
  assert.match(result.summary, /queue time and Pages deployment are excluded/);
  assert.equal(readFileSync(summaryPath, 'utf8'), result.summary);
});

test('the actual group runner writes the schema accepted by the independent timing gate', async t => {
  const f = fixture(t), { runGroup } = await import('./run-browser.mjs');
  for (const group of browserGroups) {
    await runGroup({ group, suites: suitesForGroup(group), metadata: identity, log: () => {},
      reportPath: join(f.directory, `${group}-attempt-2.json`), execute: async () => ({ exitCode: 0, signal: null }),
      readCoverage: (suite, { metadata, row }) => enemyCoverage(suite.id, metadata, row.startedAt, row.finishedAt) });
  }
  assert.equal(verifyTimings({ directory: f.directory, env }).reports.length, 8);
});

test('missing, unknown and non-file entries cannot substitute for complete group evidence', t => {
  const f = fixture(t), first = join(f.directory, `${browserGroups[0]}-attempt-2.json`);
  rmSync(first);
  assert.throws(() => verifyTimings({ directory: f.directory, env }), /Missing browser group/);
  f.save();
  const extra = join(f.directory, 'unexpected.json');
  writeFileSync(extra, '{}');
  assert.throws(() => verifyTimings({ directory: f.directory, env }), /Unexpected timing evidence file/);
  rmSync(extra); rmSync(first); mkdirSync(first);
  assert.throws(() => verifyTimings({ directory: f.directory, env }), /regular JSON files/);
});

test('future attempts, other runs, changed commits and missing identity are rejected', () => {
  for (const [key, value] of [['runId', '999'], ['runAttempt', '3'], ['commit', 'b'.repeat(40)],
    ['runId', 123456], ['runAttempt', 2], ['runId', undefined], ['commit', undefined]]) {
    const reports = records(); reports[0][key] = value;
    assert.throws(() => validateTimingReports(reports, identity), /does not match|runAttempt/, key);
  }
  for (const key of ['runId', 'runAttempt', 'commit']) {
    const expected = { ...identity }; delete expected[key];
    assert.throws(() => validateTimingReports(records(), expected), /Missing or invalid/);
  }
});

test('failed-only reruns retain earlier passed groups and select only the newest attempt of a rerun group', t => {
  const f = fixture(t);
  for (const report of f.reports) {
    rmSync(join(f.directory, `${report.group}-attempt-2.json`));
    report.runAttempt = '1';
    for (const row of report.suites) if (row.enemyCoverage) row.enemyCoverage.runAttempt = '1';
  }
  f.reports[0].status = 'failed'; f.reports[0].exitCode = 1; f.save();
  const retried = records()[0];
  writeFileSync(join(f.directory, `${retried.group}-attempt-2.json`), JSON.stringify(retried));
  const result = verifyTimings({ directory: f.directory, env });
  assert.equal(result.reports[0].runAttempt, '2');
  assert.equal(result.reports[1].runAttempt, '1');
  assert.match(result.summary, /Recorded attempt/);
  assert.match(result.summary, /earlier successful groups/);
  retried.status = 'failed'; retried.exitCode = 1;
  writeFileSync(join(f.directory, `${retried.group}-attempt-2.json`), JSON.stringify(retried));
  f.reports[0].status = 'passed'; f.reports[0].exitCode = 0; f.save();
  assert.throws(() => verifyTimings({ directory: f.directory, env }), /group did not pass/);
});

test('attempt filenames reject duplicates, aliases, future evidence and metadata mismatches', () => {
  const files = () => records().map(report => ({ name: `${report.group}-attempt-2.json`, report }));
  for (const change of [rows => rows.push(rows[0]), rows => { rows[0].name = 'batch-1.json'; },
    rows => { rows[0].name = 'batch-1-attempt-02.json'; }, rows => { rows[0].name = 'batch-9-attempt-2.json'; },
    rows => { rows[0].report.runAttempt = '1'; }, rows => { rows[0].report.group = 'batch-2'; },
    rows => { rows[0].name = 'batch-1-attempt-3.json'; rows[0].report.runAttempt = '3'; }]) {
    const rows = files(); change(rows);
    assert.throws(() => selectTimingReports(rows, identity));
  }
});

test('wrong schema, duplicate or missing group records fail', () => {
  for (const modify of [reports => reports.pop(), reports => reports.push(reports[0]),
    reports => { reports[1] = reports[0]; }, reports => { reports[0].schemaVersion = 2; },
    reports => { reports[0].group = 'other'; }, reports => { reports[0] = null; }]) {
    const reports = records(); modify(reports);
    assert.throws(() => validateTimingReports(reports, identity));
  }
});

test('missing, extra, duplicate, reordered or renamed suites cannot produce a green gate', () => {
  for (const modify of [suites => suites.pop(), suites => suites.push(suites[0]), suites => suites.splice(0),
    suites => { suites[1] = suites[0]; }, suites => { [suites[0], suites[1]] = [suites[1], suites[0]]; },
    suites => { suites[0].id = 'unknown'; }, suites => { suites[0].command = 'test:other'; }]) {
    const reports = records(); modify(reports[0].suites);
    assert.throws(() => validateTimingReports(reports, identity), /suites|suite order/);
  }
});

test('successful suite processes still need exact current enemy shard coverage at the independent gate', () => {
  for (const change of [row => { delete row.enemyCoverage; }, row => { row.enemyCoverage.status = 'running'; },
    row => { row.enemyCoverage.runAttempt = '1'; }, row => { row.enemyCoverage.units.pop(); },
    row => { row.enemyCoverage.units[0].caseIds.pop(); }, row => { row.enemyCoverage.units[1].caseIds = []; },
    row => { row.enemyCoverage.startedAt = iso(-1); }, row => { row.enemyCoverage.units[0].context.offline = false; }]) {
    const reports = records(), row = reports.flatMap(report => report.suites).find(row => row.id === 'enemy-720');
    change(row); assert.throws(() => validateTimingReports(reports, identity), /enemy/i);
  }
});

test('partial, failed, interrupted, signalled and nonzero-exit runs are rejected', () => {
  for (const status of ['failed', 'interrupted', 'running', undefined]) {
    const reports = records(); reports[0].status = status;
    assert.throws(() => validateTimingReports(reports, identity), /group did not pass/);
  }
  for (const patch of [{ exitCode: 1 }, { exitCode: undefined }, { signal: 'SIGTERM' }, { signal: undefined }]) {
    const reports = records(); Object.assign(reports[0], patch);
    assert.throws(() => validateTimingReports(reports, identity), /group did not pass/);
  }
  for (const patch of [{ status: 'failed' }, { status: 'running' }, { status: 'not_run' }, { exitCode: 1 },
    { exitCode: null }, { exitCode: undefined }, { signal: 'SIGTERM' }, { signal: undefined },
    { error: 'spawn failed' }, { timedOut: true }]) {
    const reports = records(); Object.assign(reports[0].suites[0], patch);
    assert.throws(() => validateTimingReports(reports, identity), /did not finish successfully/);
  }
});

test('durations must be present, numeric, finite and nonnegative for groups and suites', () => {
  for (const value of [undefined, null, '10', -1, NaN, Infinity]) for (const suite of [false, true]) {
    const reports = records(); (suite ? reports[0].suites[0] : reports[0]).durationMs = value;
    assert.throws(() => validateTimingReports(reports, identity), /invalid durationMs/);
  }
  const reports = records(); reports[0].durationMs = 0; reports[0].suites[0].durationMs = 0;
  assert.doesNotThrow(() => validateTimingReports(reports, identity));
});

test('completion timestamps are required and must describe sequential work inside a group', () => {
  for (const suite of [false, true]) for (const field of ['startedAt', 'finishedAt']) {
    const reports = records(); delete (suite ? reports[0].suites[0] : reports[0])[field];
    assert.throws(() => validateTimingReports(reports, identity), /timestamp/);
  }
  for (const modify of [r => { r.finishedAt = 'invalid'; }, r => { r.finishedAt = iso(-1); },
    r => { r.suites[1].startedAt = iso(500); }, r => { r.suites[0].finishedAt = iso(999999); }]) {
    const reports = records(); modify(reports[0]);
    assert.throws(() => validateTimingReports(reports, identity), /timestamp|completion precedes|sequential/);
  }
});

test('malformed JSON and summary write errors fail instead of silently dropping evidence', t => {
  const f = fixture(t);
  writeFileSync(join(f.directory, `${browserGroups[0]}-attempt-2.json`), '{invalid');
  assert.throws(() => verifyTimings({ directory: f.directory, env }), /cannot read timing report/);
  f.save();
  assert.throws(() => verifyTimings({ directory: f.directory, env, summaryPath: f.directory }));
});

test('CLI validates real JSON files without project dependencies and exits nonzero on stale evidence', t => {
  const f = fixture(t), script = fileURLToPath(new URL('./verify-timings.mjs', import.meta.url));
  const run = () => spawnSync(process.execPath, [script], { cwd: f.root,
    env: { ...process.env, ...env, GITHUB_STEP_SUMMARY: join(f.root, 'summary.md') }, encoding: 'utf8' });
  const passed = run();
  assert.equal(passed.status, 0, passed.stderr);
  assert.match(passed.stdout, /All 8 groups and 45 suites passed/);
  f.reports[0].commit = 'b'.repeat(40); f.save();
  const failed = run();
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /commit does not match/);
});
