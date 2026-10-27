import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionState, SaveSession } from '../src/session';
import { decodeSession, SESSION_KEY } from '../src/recovery-store';
import { encodeRecoveryBackup, decodePortableBackup } from '../src/save-backup';
import { MALL_ANCHORS, mallWorldV3, mallWorldV4 } from '../src/mall-world';
import { MALL_RAIDERS, MALL_RAIDER_POSTS, MALL_RAIDER_STORES } from '../src/enemy-mall';
import { separation, spacePath, traversable } from '../src/spatial';
import { damageLayerEnemy } from '../src/layer-transition';

function fixture(raw?: string) {
    const data = new Map<string, string>(raw ? [[SESSION_KEY, raw]] : []);
    let denied = false, writes = 0;
    const state = createSessionState(), storage = { getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => { if (denied) throw Error('quota'); data.set(k, v); writes++; } };
    const saves = new SaveSession(state, () => storage, undefined, () => 1800000000000);
    assert.ok(saves.initialize(), state.storageError); state.state = 'hideout';
    return { state, saves, deny: (value: boolean) => { denied = value; }, get raw() { return data.get(SESSION_KEY)!; }, get writes() { return writes; } };
}
const deploy = (seed: number, legacyEnemies = false, mallLayout: 3 | 4 = 3) => {
    const f = fixture(); assert.ok(f.saves.beginRun(seed, 'mall', { mallLayout, legacyEnemies }), f.state.storageError); return f;
};
/** The layouts a new mall raid installs the squad on: layout 3 (still deployable explicitly) and layout 4 (the default). */
const ENCOUNTER_LAYOUTS = [[3, mallWorldV3()], [4, mallWorldV4()]] as const;
const normalizeRun = (value: unknown, runId: string) => JSON.parse(JSON.stringify(value).replaceAll(runId, '<same-run>'));

test('new layout3/4 mall uses three existing upstairs slots, one existing crate and no new RNG or scene goods across 100 seeds', () => {
    for (const [layout, world] of ENCOUNTER_LAYOUTS) for (let seed = 1; seed <= 100; seed++) {
        const f = deploy(seed, false, layout), old = deploy(seed, true, layout), raid = f.state.expansion!.raid!, baseline = old.state.expansion!.raid!;
        const actors = Object.values(raid.maps).flatMap(m => m.enemies), native = actors.filter(e => e.tactics?.squad === MALL_RAIDERS);
        assert.equal(actors.length, 25); assert.equal(new Set(actors.map(e => e.uid)).size, 25);
        assert.equal(native.length, 3); assert.equal(raid.maps['mall-f2'].enemies.length, 9);
        assert.deepEqual(normalizeRun(raid.maps['mall-f1'], raid.runId), normalizeRun(baseline.maps['mall-f1'], baseline.runId));
        assert.equal(raid.rng, baseline.rng); assert.equal(raid.nextEntity, baseline.nextEntity);
        assert.deepEqual(actors.filter(e => e.id === 'elite'), Object.values(baseline.maps).flatMap(m => m.enemies).filter(e => e.id === 'elite'));
        for (const e of native) {
            assert.ok(MALL_RAIDER_POSTS.find(p => p.id === e.id)!.positions.some(p => separation(p, e) === 0));
            assert.ok(world.maps['mall-f2'].entries.every(p => separation(p.at, e) >= 144));
            for (const highTide of [false, true]) assert.ok(traversable({ definition: world.maps['mall-f2'], doors: {}, highTide }, e, 'body', 10));
        }
        const f2 = raid.maps['mall-f2'], b2 = baseline.maps['mall-f2'];
        assert.deepEqual(normalizeRun(f2.loot, raid.runId), normalizeRun(b2.loot, baseline.runId));
        assert.deepEqual(normalizeRun(f2.containers.map(({ x, y, ...c }) => c), raid.runId), normalizeRun(b2.containers.map(({ x, y, ...c }) => c), baseline.runId));
        assert.equal(f2.containers.filter((c, i) => separation(c, b2.containers[i]) !== 0).length, 1);
        assert.equal(f2.containers.filter(c => MALL_RAIDER_STORES.some(p => separation(p, c) === 0)).length, 1);
        assert.ok(f2.containers.some(c => separation(c, MALL_ANCHORS.box2) === 0));
        assert.doesNotThrow(() => decodeSession(f.raw));
    }
});

test('mall deployment quota failure keeps prior exact bytes and profile; retry commits 8/3/5 with original backups', () => {
    const f = fixture(), before = f.raw, save = structuredClone(f.state.save), writes = f.writes;
    f.deny(true); assert.equal(f.saves.beginRun(42, 'mall', { mallLayout: 3 }), false);
    assert.equal(f.raw, before); assert.deepEqual(f.state.save, save); assert.equal(f.state.expansion, null); assert.equal(f.writes, writes);
    f.deny(false); assert.ok(f.saves.beginRun(42, 'mall', { mallLayout: 3 }), f.state.storageError);
    const r = decodeSession(f.raw);
    assert.equal(r.version, 8); assert.equal(r.expansion!.version, 3); assert.equal(r.expansion!.raid!.version, 5);
    assert.equal(r.enemyBackup, before); assert.ok(f.saves.persist());
    const saved = decodeSession(f.raw);
    assert.equal(saved.enemyBackup, before); assert.equal(saved.gunsBackup, r.gunsBackup);
    assert.equal(saved.systemsBackup, r.systemsBackup); assert.equal(saved.perksBackup, r.perksBackup);
});

test('old active mall layouts 1/2/3 restore the saved roster, ammunition and RNG without installing new encounters', () => {
    for (const layout of [1, 2, 3] as const) {
        const f = fixture(); assert.ok(f.saves.beginRun(42, 'mall', { mallLayout: layout, legacyEnemies: true }));
        const original = decodeSession(f.raw), restored = fixture(f.raw), record = decodeSession(restored.raw);
        assert.equal(record.version, original.version); assert.equal(record.expansion!.raid!.version, 3);
        assert.deepEqual(record.expansion!.raid, original.expansion!.raid);
        assert.equal(Object.values(record.expansion!.raid!.maps).flatMap(m => m.enemies).some(e => e.tactics), false);
        restored.state.state = 'menu'; assert.ok(restored.saves.resumeRun());
    }
});

test('mall tactical phases and original backups survive reload and portable import; corrupt role equipment is rejected', () => {
    const f = deploy(42), raid = f.state.expansion!.raid!, gunner = raid.maps['mall-f2'].enemies.find(e => e.id === 'raider-gunner')!;
    Object.assign(gunner.tactics!, { magazine: 0, phase: 'reload', phaseLeft: 1.3 });
    assert.ok(f.saves.persist(), f.state.storageError);
    const original = decodeSession(f.raw), reloaded = fixture(f.raw);
    assert.deepEqual(decodeSession(reloaded.raw).expansion!.raid, original.expansion!.raid);
    const backup = decodePortableBackup(encodeRecoveryBackup(original));
    assert.equal(backup.kind, 'session');
    if (backup.kind === 'session') assert.deepEqual(backup.record.expansion!.raid, original.expansion!.raid);
    for (const key of ['gunsBackup', 'systemsBackup', 'perksBackup', 'enemyBackup'] as const) {
        assert.equal(decodeSession(reloaded.raw)[key], original[key]);
        if (backup.kind === 'session') assert.equal(backup.record[key], original[key]);
    }
    const bad = structuredClone(original); bad.expansion!.raid!.maps['mall-f2'].enemies.find(e => e.uid === gunner.uid)!.tactics!.equipment = 'rifle';
    assert.throws(() => decodeSession(JSON.stringify(bad)), /存档|行动/);
    assert.doesNotThrow(() => decodeSession(JSON.stringify(original)));
});

test('two east stair returns and terrace through-route stay clear of the authored raider pocket at either tide', () => {
    for (const [, world] of ENCOUNTER_LAYOUTS) for (const highTide of [false, true]) {
        const map = world.maps['mall-f2'];
        const context = { definition: map, doors: {}, highTide };
        const north = map.entries.find(e => e.id === 'S-N-down')!, south = map.entries.find(e => e.id === 'S-E-down')!;
        const route = spacePath(context, north.at, south.at);
        assert.ok(route.length);
        for (const p of route) for (const post of MALL_RAIDER_POSTS) for (const home of post.positions)
            assert.ok(separation(p, home) > 340, 'the east return does not cross the squad sight radius');
    }
});

test('upstairs gunner death uses spent ammunition and one corpse through save and reload', () => {
    const f = deploy(42), state = f.state.expansion!, raid = state.raid!, layer = raid.maps['mall-f2'];
    const gunner = layer.enemies.find(e => e.id === 'raider-gunner')!;
    gunner.tactics!.magazine = 1; gunner.tactics!.reserve = 2;
    damageLayerEnemy(state, 'mall-f2', gunner, gunner.hp * 2);
    damageLayerEnemy(state, 'mall-f2', gunner, 100);
    const corpses = layer.containers.filter(c => c.id === `corpse-${gunner.uid}`);
    assert.equal(corpses.length, 1); assert.equal(raid.kills, 1);
    assert.equal(corpses[0].inventory.items.filter(i => i.id === 'ammo9').reduce((sum, i) => sum + i.qty, 0), 3);
    assert.ok(f.saves.persist(), f.state.storageError);
    const restored = decodeSession(fixture(f.raw).raw).expansion!.raid!;
    assert.deepEqual(restored.maps['mall-f2'], layer);
});
