import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionState, SaveSession } from '../src/session';
import { decodeSession, RecoveryStore, SESSION_KEY, type SessionRecord } from '../src/recovery-store';
import { decodePortableBackup, encodeRecoveryBackup } from '../src/save-backup';
import { resolveExpansionWorld } from '../src/expansion-worlds';
import { resolveLayerShot } from '../src/layer-transition';
import { CoastRaidRuntime } from '../src/raid-runtime/runtime';
import { RealHideoutRuntime } from '../src/hideout-runtime';
import { startOver } from '../src/fresh-start';
import { seededRandom } from '../src/domain';
import { plainCrit } from './fixtures/layered';
import { oldRecord } from './fixtures/old-saves';

const NOW = 1800000000000;
function page(raw?: string) {
    const data = new Map<string, string>(raw ? [[SESSION_KEY, raw]] : []);
    let full = false;
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => {
        if (full) throw Error('quota'); data.set(k, v);
    } };
    const state = createSessionState(), saves = new SaveSession(state, () => storage, undefined, () => NOW);
    assert.ok(saves.initialize(), state.storageError); state.state = state.save.activeRun ? 'menu' : 'hideout';
    return { data, storage, state, saves, fail: (value: boolean) => { full = value; },
        get raw() { return data.get(SESSION_KEY)!; }, get record() { return decodeSession(data.get(SESSION_KEY)!); } };
}
/**
 * The record the client before gun instances (main 67a7468) stored for this live action: a Perk-only v5 (raid v3), or an
 * enemy-only v6 (raid v4, expansion v2). The current client reads either and writes it as v8, enemy rules on for the v6.
 */
function historical(version: 5 | 6) {
    const p = page(); assert.ok(p.saves.beginRun(42, true, { legacyEnemies: version === 5 }));
    const r = oldRecord(p.record);
    if (version === 6) {
        r.version = 6; delete r.perksBackup;
        r.expansion!.version = 2; delete r.expansion!.growth.perks; r.expansion!.raid!.version = 4;
    }
    assert.equal(r.version, version);
    const raw = JSON.stringify(r, null, 2) + '\n'; assert.doesNotThrow(() => decodeSession(raw)); return raw;
}
/** Enemy rules are on: a v8 record says so by holding enemyBackup. */
const enemyOn = (record: SessionRecord) => Object.hasOwn(record, 'enemyBackup');
function hit(record: SessionRecord) {
    const state = structuredClone(record.expansion!), raid = state.raid!, world = resolveExpansionWorld(raid.worldVersion)!;
    const enemy = raid.maps.coast.enemies.find(e => !e.tactics && e.hp > 20)!;
    let rng = 1; while (!(seededRandom(rng)() >= .07 && seededRandom(rng)() < .1)) rng++;
    raid.rng = rng;
    const hp = enemy.hp;
    assert.ok(resolveLayerShot(state, world, 'coast', { uid: 'probe', x: enemy.x, y: enemy.y, rotation: 0,
        vx: 900, vy: 0, left: 30, damage: 10, enemy: false, ...(raid.version === 4 ? {} : { crit: plainCrit() }) }, true));
    return { damage: hp - enemy.hp, rng: raid.rng };
}

test('historical Perk and enemy actions keep distinct critical rules through checkpoint, reopen and import', () => {
    for (const version of [5, 6] as const) {
        const p = page(historical(version)), record = p.record, raid = record.expansion!.raid!;
        assert.equal(raid.version, version === 5 ? 3 : 4);
        assert.equal(p.saves.ensureRpg(), false);
        assert.equal(hit(record).damage, version === 5 ? 10 : 15);
        assert.ok(p.saves.resumeRun()); p.state.state = 'run';
        const runtime = new CoastRaidRuntime(p.state, p.saves);
        assert.ok(p.saves.persist()); runtime.cancelStart();
        assert.equal(p.record.version, 8); assert.equal(enemyOn(p.record), version === 6); assert.deepEqual(hit(p.record), hit(record));
        const reopened = page(p.raw); assert.deepEqual(hit(reopened.record), hit(record));
        const portable = decodePortableBackup(encodeRecoveryBackup(p.record));
        assert.equal(portable.kind, 'session'); if (portable.kind !== 'session') continue;
        const target = page(); assert.ok(target.saves.importRecord(portable.record));
        assert.equal(target.record.version, 8); assert.equal(enemyOn(target.record), version === 6); assert.deepEqual(hit(target.record), hit(record));
        assert.equal(target.record.enemyBackup, record.enemyBackup); assert.equal(target.record.perksBackup, record.perksBackup);
    }
});

test('enemy-only v6 settles before Perk upgrade: failed upgrade preserves exact bytes and retry retains both backups once', () => {
    const p = page(historical(6)), enemyBackup = p.record.enemyBackup;
    assert.ok(p.saves.resumeRun()); p.state.state = 'run';
    assert.ok(p.saves.prepareSettlement('extract', 0)); assert.ok(p.saves.retrySettlement());
    assert.equal(p.record.version, 8); assert.ok(enemyOn(p.record)); assert.equal(p.record.expansion!.version, 2);
    p.state.state = 'hideout'; const before = p.raw;
    p.fail(true); assert.equal(p.saves.ensureRpg(), false); assert.equal(p.raw, before);
    assert.equal(p.state.expansion!.version, 2);
    p.fail(false); assert.ok(p.saves.ensureRpg());
    assert.equal(p.record.version, 8); assert.equal(p.record.perksBackup, before); assert.equal(p.record.enemyBackup, enemyBackup);
    assert.ok(p.saves.beginRun(43, true)); assert.equal(p.record.expansion!.raid!.version, 5);
    assert.equal(hit(p.record).damage, 10); assert.ok(p.saves.persist());
    const reopened = page(p.raw); assert.equal(reopened.record.perksBackup, before); assert.equal(reopened.record.enemyBackup, enemyBackup);
    assert.ok(reopened.saves.persist()); assert.equal(reopened.record.perksBackup, before);
});

test('Perk-first deployment turns enemy rules on once; both backups survive settlement, reset and portable import', () => {
    const p = page(); assert.ok(p.saves.enableExpansion()); const v4 = p.raw;
    assert.ok(p.saves.enableRpg()); const v5 = p.raw;
    assert.equal(p.record.perksBackup, v4);
    p.fail(true); assert.equal(p.saves.beginRun(42, true), false); assert.equal(p.raw, v5);
    p.fail(false); assert.ok(p.saves.beginRun(42, true)); p.state.state = 'run';
    assert.equal(p.record.version, 8); assert.equal(p.record.enemyBackup, v5); assert.equal(p.record.perksBackup, v4);
    assert.ok(p.saves.prepareSettlement('extract', 0)); assert.ok(p.saves.retrySettlement()); p.state.state = 'hideout';
    const rt = new RealHideoutRuntime(p.state, p.saves, () => NOW); assert.ok(rt.enter().ok);
    assert.ok(startOver(rt, () => p.storage, NOW).ok);
    assert.equal(p.record.version, 8); assert.equal(p.record.enemyBackup, v5); assert.equal(p.record.perksBackup, v4);
    const decoded = decodePortableBackup(encodeRecoveryBackup(p.record)); assert.equal(decoded.kind, 'session');
    if (decoded.kind !== 'session') return;
    const q = page(); assert.ok(q.saves.importRecord(decoded.record));
    assert.equal(q.record.version, 8); assert.equal(q.record.enemyBackup, v5); assert.equal(q.record.perksBackup, v4);
});

test('combined records reject mismatched rules, missing snapshots, lost backups and downgrade without overwriting', () => {
    const p = page(); assert.ok(p.saves.beginRun(42, true));
    const valid = p.record;
    const faults: ((r: any) => void)[] = [
        r => { r.version = 5; delete r.enemyBackup; }, r => { r.version = 6; delete r.perksBackup; },
        r => { delete r.enemyBackup; }, r => { delete r.perksBackup; }, r => { r.enemyBackup = 5; },
        r => { Object.assign(r, oldRecord(r, 5)); delete r.enemyBackup; }, r => { Object.assign(r, oldRecord(r, 6)); delete r.perksBackup; },
        r => { r.expansion.raid.version = 3; }, r => { r.expansion.raid.version = 4; },
        r => { const raid = r.expansion.raid; raid.maps.coast.bullets.push({ uid: `entity-${raid.runId}-${raid.nextEntity++}`,
            x: raid.player.x, y: raid.player.y, rotation: 0, vx: 100, vy: 0, left: 50, damage: 10, enemy: false }); },
    ];
    for (const fault of faults) {
        const bad = structuredClone(valid); fault(bad); const raw = JSON.stringify(bad);
        assert.throws(() => decodeSession(raw));
        const data = new Map([[SESSION_KEY, raw]]), storage = { getItem: (k: string) => data.get(k) ?? null,
            setItem: () => { throw Error('corrupt records must never be written'); } };
        assert.throws(() => new RecoveryStore(storage).load()); assert.equal(data.get(SESSION_KEY), raw);
    }
    const store = new RecoveryStore(p.storage), loaded = store.load(), old = structuredClone(loaded.expansion!);
    old.version = 2; delete old.growth.perks; old.raid!.version = 4;
    const raw = p.raw; assert.throws(() => store.commit(loaded.save, null, undefined, old)); assert.equal(p.raw, raw);
});

test('combined Runtime fires the selected Perk snapshot, consumes breath once and restores the in-flight round exactly', () => {
    const p = page(); assert.ok(p.saves.enableRpg());
    const choice = p.saves.prepareExpansionMutation(d => {
        d.expansion.growth.permanent.technique = 25;
        d.expansion.growth.perks = ['technique-15-a', 'technique-20-a', 'technique-25-a'];
    });
    assert.ok(choice); assert.equal(p.saves.commitExpansionMutation(choice), 'committed');
    assert.ok(p.saves.beginRun(42, true)); p.state.state = 'run';
    const r = new CoastRaidRuntime(p.state, p.saves);
    assert.equal(r.breathOwned, true); assert.equal(r.layered!.raid!.version, 5);
    const target = r.enemies.find(e => e.tactics)!; r.breath.target = target.uid; r.breath.seconds = 2;
    r.mag = 1; assert.ok(r.shoot()); assert.equal(r.mag, 0); assert.deepEqual(r.breath, { target: null, seconds: 0 });
    const round = structuredClone(r.bullets.at(-1)!);
    assert.equal(round.crit!.target, target.uid); assert.equal(round.crit!.multiplier, 1.7);
    assert.equal(round.crit!.sources.find(s => s.id === 'technique-15-a')!.chance, .2);
    assert.equal(round.crit!.sources.find(s => s.id === 'technique-20-a')!.chance, .05);
    assert.ok(p.saves.persist(), p.state.storageError); r.cancelStart();
    const next = page(p.raw); assert.ok(next.saves.resumeRun()); next.state.state = 'run';
    const restored = new CoastRaidRuntime(next.state, next.saves);
    assert.deepEqual(restored.bullets.find(b => b.uid === round.uid), round);
    assert.deepEqual(restored.breath, { target: null, seconds: 0 }); restored.cancelStart();
});
