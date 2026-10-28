import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { completeEnemyUnit, createEnemyCoverage, enemyReportPath, enemySelection, enemyShardIds, enemyUnits,
  validateEnemyCoverage, validateEnemyPartition } from '../enemy-browser-plan.mjs';

const identity = { runId: '123', runAttempt: '1', commit: 'a'.repeat(40) };
const start = '2026-10-25T00:00:00.000Z', finish = '2026-10-25T00:01:00.000Z';
const coverage = shard => ({ ...createEnemyCoverage(enemySelection([`--shard=${shard}`]), identity, start),
  finishedAt: finish, status: 'passed', units: enemyUnits(enemySelection([`--shard=${shard}`])) });

test('default enemy entry preserves the three original viewport chains and the shards partition every case exactly once', () => {
  const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts;
  assert.equal(scripts['test:enemy'], 'node --import tsx scripts/enemy-browser-test.mjs');
  for (const id of enemyShardIds) assert.equal(scripts[`test:${id}`], `${scripts['test:enemy']} --shard=${id}`);
  assert.deepEqual(enemySelection().viewports, [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }, { width: 844, height: 390 }]);
  const all = enemyUnits(), shards = enemyShardIds.map(coverage);
  assert.deepEqual(all.map(unit => [unit.id, unit.caseIds.length]), [
    ['1280x720/street', 64], ['1920x1080/street', 56], ['844x390/street', 36],
    ['1280x720/mall', 3], ['1920x1080/mall', 3], ['844x390/mall', 3],
  ]);
  assert.equal(all.flatMap(unit => unit.caseIds).length, 165, 'Original full acceptance case inventory');
  for (const unit of all) {
    assert.equal(new Set(unit.caseIds).size, unit.caseIds.length);
    assert.deepEqual(unit.context, { offline: true, hasTouch: unit.viewport.width < 1000, isMobile: unit.viewport.width < 1000 });
  }
  validateEnemyPartition(shards);
  for (const shard of shards) validateEnemyCoverage(shard, shard.shard, identity);
  assert.equal(enemyReportPath('all'), 'test-results/enemy-browser/report.json');
  assert.equal(new Set(enemyShardIds.map(enemyReportPath)).size, 3, 'Shard reports cannot overwrite one another or the full report');
  assert.ok(!enemyShardIds.map(enemyReportPath).includes(enemyReportPath('all')));
});

test('unknown, empty and repeated CLI selections fail before opening Chromium', () => {
  for (const args of [['--shard='], ['--shard=enemy-typo'], ['--only=nothing'], ['--shard=enemy-720', '--shard=enemy-720']]) {
    assert.throws(() => enemySelection(args), /Usage:/);
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/enemy-browser-test.mjs', ...args], { encoding: 'utf8' });
    assert.notEqual(result.status, 0); assert.match(result.stderr, /Usage:/);
    assert.doesNotMatch(result.stderr, /browserType.launch|Executable doesn't exist/);
  }
  assert.throws(() => enemyUnits({ shard: 'all', viewports: [] }), /must not be empty/);
  assert.throws(() => enemyUnits({ shard: 'all', viewports: [{ width: 1280, height: 720 }] }), /complete declared/);
});

test('completion markers require every original case and cannot record a unit twice', () => {
  const selection = enemySelection(['--shard=enemy-720']), record = createEnemyCoverage(selection, identity, start);
  const unit = enemyUnits(selection)[0];
  const cases = unit.caseIds.map(id => ({ viewport: unit.viewport, scenario: id.split('/')[1] }));
  for (const bad of [[], cases.slice(1), [...cases, cases[0]], [...cases, { viewport: unit.viewport, scenario: 'unexpected' }]]) {
    assert.throws(() => completeEnemyUnit(record, unit.viewport, 'street', bad), /case coverage differs/);
    assert.equal(record.units.length, 0);
  }
  completeEnemyUnit(record, unit.viewport, 'street', cases);
  assert.throws(() => completeEnemyUnit(record, unit.viewport, 'street', cases), /Duplicate enemy unit/);
  assert.throws(() => completeEnemyUnit(record, { width: 1, height: 1 }, 'street', cases), /Unknown enemy viewport/);
});

test('missing, duplicate and overlapping shard evidence cannot satisfy the full partition', () => {
  for (const change of [rows => rows.pop(), rows => rows.push(rows[0]), rows => { rows[1] = rows[0]; },
    rows => { rows[0].units.pop(); }, rows => { rows[0].units[0] = rows[1].units[0]; },
    rows => { rows[0].units[0].caseIds.pop(); }, rows => { rows[0].units[0].caseIds.push(rows[0].units[0].caseIds[0]); }]) {
    const rows = enemyShardIds.map(coverage); change(rows);
    assert.throws(() => validateEnemyPartition(rows));
  }
});

test('failure, wrong identity, stale output, missing native/mall cases and changed input configurations fail closed', () => {
  for (const change of [row => { row.status = 'running'; }, row => { row.schemaVersion = 2; },
    row => { row.shard = 'enemy-touch'; }, row => { row.runId = 'other'; }, row => { row.runAttempt = '2'; },
    row => { delete row.commit; }, row => { delete row.startedAt; }, row => { row.finishedAt = start; row.startedAt = finish; },
    row => { row.units = []; }, row => { row.units.push(row.units[0]); }, row => { row.units[1] = row.units[0]; },
    row => { row.units[0].viewport.width = 1000; }, row => { row.units[0].context.offline = false; },
    row => { row.units[0].context.hasTouch = true; }, row => { row.units[0].context.isMobile = true; },
    row => { row.units[0].caseIds = row.units[0].caseIds.filter(id => !id.includes('native-recovery-')); },
    row => { row.units[1].caseIds.pop(); }, row => { row.units[0].caseIds.push(row.units[0].caseIds[0]); }]) {
    const row = coverage('enemy-720'); change(row);
    assert.throws(() => validateEnemyCoverage(row, 'enemy-720', identity));
  }
  assert.throws(() => validateEnemyCoverage(coverage('enemy-720'), 'enemy-720', identity,
    { start: Date.parse(start) + 1, finish: Date.parse(finish) }), /stale/);
});
