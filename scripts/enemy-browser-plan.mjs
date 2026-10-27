/** Independent viewport chains, shared by the full enemy entry, CI shards and the evidence gate.
 * Node 24 strips the catalog's erasable TypeScript; this module needs no installed packages.
 */
import assert from 'node:assert/strict';
import { ENEMY_CATALOG } from './enemy-catalog-data.ts';

export const enemyViewports = Object.freeze([
  Object.freeze({ width: 1280, height: 720 }),
  Object.freeze({ width: 1920, height: 1080 }),
  Object.freeze({ width: 844, height: 390 }),
]);
export const enemyShardIds = Object.freeze(['enemy-720', 'enemy-1080', 'enemy-touch']);

export function enemySelection(args = []) {
  if (args.length === 0) return { shard: 'all', viewports: [...enemyViewports] };
  const match = args.length === 1 && /^--shard=(enemy-[a-z0-9]+)$/.exec(args[0]);
  const index = match ? enemyShardIds.indexOf(match[1]) : -1;
  if (index < 0) throw Error('Usage: enemy-browser-test.mjs [--shard=enemy-720|enemy-1080|enemy-touch]');
  return { shard: enemyShardIds[index], viewports: [enemyViewports[index]] };
}

const label = viewport => `${viewport.width}x${viewport.height}`;
const sameViewport = (a, b) => a?.width === b.width && a?.height === b.height;
const sorted = values => [...values].sort();

// Case IDs are checked independently of successful process exit. Whole native chains stay intact:
// deployment, real input, paid attack and actual refresh are never separately selectable.
function casesFor(viewport, area) {
  const touch = viewport.width < 1000;
  if (area === 'mall') return ['native-mall-deployment', 'native-mall-real-stair', 'native-mall-art-and-paid-restore'];
  const roles = ENEMY_CATALOG.filter(card => card.assets.status === 'body-and-corpse').map(card => card.id);
  const cases = touch ? ['parley'] : ['windup', 'reload', 'recovery', 'parley'];
  for (const role of roles) {
    if (touch || role !== 'raider-gunner') cases.push(`${role}-windup`);
    if (!touch) cases.push(`${role}-corpse`);
  }
  if (viewport.width === 1280) cases.push(...[
    'tidal-crab', 'saltback-dog', 'sac-spitter', 'salt-dazed', 'tide-chaser', 'salt-hulk',
  ].map(role => `${role}-motion-contract`), 'enemy-synth-output-contract', 'spit-presentation-contract');
  cases.push('native-market-deployment-and-restore', ...[
    'tidal-crab', 'saltback-dog', 'sac-spitter',
  ].map(role => `native-fauna-${role}`), ...[
    [47, 'salt-dazed'], [47, 'tide-chaser'], [47, 'tide-ritualist'], [62, 'tide-ritualist'], [47, 'salt-hulk'],
  ].map(([seed, role]) => `native-affected-${role}-${seed}`), ...[
    'recovery-leader', 'mercenary-scout', 'mercenary-assault', 'mercenary-support',
  ].map(role => `native-recovery-${role}`), 'native-blockade-registration-and-passage', ...[
    'blockade-sentry', 'blockade-patrol', 'blockade-sergeant',
  ].map(role => `native-blockade-${role}`));
  return cases;
}

export function enemyUnits(selection = enemySelection()) {
  assert.ok(selection.viewports.length > 0, 'Enemy selection must not be empty');
  assert.deepEqual(selection, selection.shard === 'all' ? enemySelection() : enemySelection([`--shard=${selection.shard}`]),
    'Enemy selection must use the complete declared viewport configuration');
  return ['street', 'mall'].flatMap(area => selection.viewports.map(viewport => ({
    id: `${label(viewport)}/${area}`, viewport: { ...viewport },
    context: { offline: true, hasTouch: viewport.width < 1000, isMobile: viewport.width < 1000 },
    caseIds: casesFor(viewport, area).map(id => `${label(viewport)}/${id}`),
  })));
}

export function enemyReportPath(shard) {
  assert.ok(shard === 'all' || enemyShardIds.includes(shard), 'Unknown enemy report shard');
  return shard === 'all' ? 'test-results/enemy-browser/report.json' : `test-results/enemy-browser/${shard}/report.json`;
}

export function createEnemyCoverage(selection, identity, startedAt = new Date().toISOString()) {
  enemyUnits(selection);
  return { schemaVersion: 1, shard: selection.shard, runId: identity.runId, runAttempt: identity.runAttempt,
    commit: identity.commit, startedAt, finishedAt: null, status: 'running', units: [] };
}

export function completeEnemyUnit(coverage, viewport, area, cases) {
  const plan = enemyUnits(coverage.shard === 'all' ? enemySelection() : enemySelection([`--shard=${coverage.shard}`]));
  const unit = plan.find(unit => sameViewport(viewport, unit.viewport) && unit.id.endsWith(`/${area}`));
  assert.ok(unit, 'Unknown enemy viewport or area');
  assert.ok(!coverage.units.some(done => done.id === unit.id), `Duplicate enemy unit: ${unit.id}`);
  const actual = cases.filter(row => sameViewport(row.viewport, viewport) && row.scenario.startsWith('native-mall-') === (area === 'mall'))
    .map(row => `${label(viewport)}/${row.scenario}`);
  assert.deepEqual(sorted(actual), sorted(unit.caseIds), `Enemy case coverage differs for ${unit.id}`);
  coverage.units.push({ ...unit, caseIds: actual });
}

export function validateEnemyCoverage(coverage, shard, identity, period) {
  assert.ok(coverage && coverage.schemaVersion === 1 && coverage.shard === shard, 'Missing or wrong enemy coverage schema/shard');
  assert.equal(coverage.status, 'passed', 'Enemy coverage did not finish');
  for (const key of ['runId', 'runAttempt', 'commit']) assert.equal(coverage[key], identity[key], `Enemy coverage ${key} does not match`);
  for (const key of ['startedAt', 'finishedAt']) {
    assert.equal(typeof coverage[key], 'string', `Missing enemy coverage ${key}`);
    assert.ok(Number.isFinite(Date.parse(coverage[key])), `Invalid enemy coverage ${key}`);
    assert.equal(new Date(coverage[key]).toISOString(), coverage[key], `Invalid enemy coverage ${key}`);
  }
  assert.ok(Date.parse(coverage.finishedAt) >= Date.parse(coverage.startedAt), 'Enemy coverage completion precedes start');
  if (period) assert.ok(Date.parse(coverage.startedAt) >= period.start && Date.parse(coverage.finishedAt) <= period.finish,
    'Enemy coverage is stale or outside the suite execution');
  const expected = enemyUnits(shard === 'all' ? enemySelection() : enemySelection([`--shard=${shard}`]));
  assert.ok(Array.isArray(coverage.units), 'Missing enemy units');
  assert.deepEqual(coverage.units.map(unit => unit.id), expected.map(unit => unit.id), 'Enemy units are missing, duplicate or out of order');
  for (const [index, unit] of coverage.units.entries()) {
    assert.deepEqual(unit.viewport, expected[index].viewport, 'Enemy viewport configuration differs');
    assert.deepEqual(unit.context, expected[index].context, 'Enemy context configuration differs');
    assert.ok(Array.isArray(unit.caseIds), 'Missing enemy cases');
    assert.deepEqual(sorted(unit.caseIds), sorted(expected[index].caseIds), 'Enemy cases are missing, duplicate or unexpected');
  }
  return coverage;
}

export function validateEnemyPartition(coverages) {
  assert.deepEqual(sorted(coverages.map(coverage => coverage.shard)), sorted(enemyShardIds), 'Missing or duplicate enemy shards');
  const units = coverages.flatMap(coverage => coverage.units);
  assert.deepEqual(sorted(units.map(unit => unit.id)), sorted(enemyUnits().map(unit => unit.id)), 'Enemy shards must cover every unit exactly once');
  assert.deepEqual(sorted(units.flatMap(unit => unit.caseIds)), sorted(enemyUnits().flatMap(unit => unit.caseIds)),
    'Enemy shards must cover every case exactly once');
}
