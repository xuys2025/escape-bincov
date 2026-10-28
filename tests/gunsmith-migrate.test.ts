import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as D from '../src/domain';
import { SaveSession, createSessionState } from '../src/session';
import { RecoveryStore, SESSION_KEY, decodeSession, type SessionRecord } from '../src/recovery-store';
import { decodeBackup, decodePortableBackup } from '../src/save-backup';
import { decodeStoredProfile } from '../src/profile-codec';
import type { WorldResolver } from '../src/expansion-state';
import { RealHideoutRuntime } from '../src/hideout-runtime';
import { CoastRaidRuntime } from '../src/raid-runtime/runtime';
import { GUNS } from '../src/gunsmith/catalog';
import { factoryState, isGunId, validateGun } from '../src/gunsmith/instance';
import { OLD_GUNS, migrateProfile, migrateRecord, type ProfileV2, type RecordV7 } from '../src/gunsmith/migrate';
import { prototypeWorld } from './fixtures/layered';
import { holders, oldProfile, oldRecord } from './fixtures/old-saves';

// Gunsmith M0-06 and M1-02 (docs/gunsmith/CONTRACTS.md, the save and migration section): the pure migration to profile
// v3 / record v8 and its wiring into reading. The old saves are real bytes a client before gun instances wrote
// (fixtures/gunsmith-v5-saves.json, frozen at feat/gunsmith e19cf00, before #81 took records 6 and 7); each goes through
// the real decodeSession, is written back as v8 and read again. That old clients refuse the new formats is checked
// against real pinned old clients in test:expansion (scripts/expansion-browser-test.mjs), not against a stand-in here.
const NOW = 1800000000000;
const REFUSED = /存档格式不支持或内容不完整/, UNREADABLE = /无法读取这份存档/;
const SAVES = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'gunsmith-v5-saves.json'), 'utf8'));
/** The exact text of a frozen sample: records and recovery files compact, the settled profile file with an indent of 2. */
const old = (name: string): string => name === 'settledProfileFile' ? JSON.stringify(SAVES[name], null, 2) : JSON.stringify(SAVES[name]);
/** The record inside a frozen recovery backup file, as its text. */
const inner = (name: string): string => JSON.stringify(SAVES[name].record);
const world = prototypeWorld(), prototype: WorldResolver = id => id === world.id ? world : undefined;

function origin() {
    const data = new Map<string, string>(), failing = new Set<string>();
    const storage: D.StorageLike = { getItem: k => data.get(k) ?? null, setItem: (k, v) => { if (failing.has(k)) throw new Error('quota'); data.set(k, v); } };
    return { data, failing, storage };
}
type Origin = ReturnType<typeof origin>;
/** One page on the origin: SaveSession and the yard Runtime; `enter` walks into the station. */
function page(o: Origin = origin(), enter = true, resolve?: WorldResolver) {
    const state = createSessionState(), saves = new SaveSession(state, () => o.storage, resolve, () => NOW);
    const initialized = saves.initialize();
    const runtime = new RealHideoutRuntime(state, saves, () => NOW);
    if (enter) assert.ok(runtime.enter().ok);
    return { o, state, saves, runtime, initialized, get raw() { return o.data.get(SESSION_KEY)!; }, get record() { return decodeSession(o.data.get(SESSION_KEY)!, resolve); } };
}
/** A page on an origin that holds `text` as its stored record. */
function opened(text: string, resolve?: WorldResolver) { const o = origin(); o.data.set(SESSION_KEY, text); return page(o, false, resolve); }
/** The record the previous client (session v4) wrote for the same raid: expansion and raid v2, no perks (as the M0 sample). */
function asV4(text: string): string {
    const r = JSON.parse(text); assert.equal(r.version, 5); assert.deepEqual(r.expansion.growth.perks, []);
    r.version = 4; delete r.perksBackup; r.expansion.version = 2; delete r.expansion.growth.perks;
    if (r.expansion.raid) r.expansion.raid.version = 2;
    return JSON.stringify(r);
}
const envelope = (record: { version: number }) => JSON.stringify({ format: 'escape-bincov-recovery-backup', formatVersion: record.version, record });
const importText = (p: ReturnType<typeof page>, text: string) => { const preview = p.runtime.previewImport(text); assert.ok(preview.ok && preview.token, text.slice(0, 80)); return p.runtime.importBackup(text, preview.token!); };
/** Gun uids wherever a profile keeps them, and the equipped one: what must survive a migration, a raid and a settlement once. */
const gunUids = (p: D.SaveDataV1) => [...[p.stash, p.bag, p.safe].flatMap(inv => inv.items.filter(i => isGunId(i.id)).map(i => i.uid)), ...(p.equipment.weaponUid ? [p.equipment.weaponUid] : [])].sort();

/**
 * The proof every old record goes through: read as v8 with its exact text as gunsBackup (a v2 record keeps its bytes as
 * migrationBackup instead); lossless (taking the added fields away gives the stored record back); every gun a factory
 * instance under its own uid and the equipped one `equipped`; deterministic. Then the real persist and reload: the first
 * write stores v8, the old bytes stay, a second write keeps them and a reopened page reads the same profile.
 */
function prove(name: string, text: string, resolve?: WorldResolver, equipped = ['gun-v6']) {
    const stored = JSON.parse(text), after = decodeSession(text, resolve);
    assert.deepEqual([after.version, after.profile.version, after.gunsBackup], [8, 3, stored.version === 2 ? null : text], name);
    if (stored.version >= 3) assert.deepEqual(oldRecord(after, stored.version), stored, `${name}: nothing but the gun fields changes`);
    const was = holders(stored), now = holders(after);
    assert.equal(now.items.length, was.items.length, name);
    assert.ok(now.items.some(i => isGunId(i.id)) || now.slots.some(s => s.weapon !== null), `${name} holds guns`);
    for (const item of now.items) {
        if (!isGunId(item.id)) { assert.equal(Object.hasOwn(item, 'gun'), false, `${name} ${item.id}`); continue; }
        assert.deepEqual(item.gun, factoryState(), `${name} ${item.uid}`); assert.deepEqual(validateGun(item.id, item.uid, item.gun), { ok: true });
    }
    for (const slot of now.slots) {
        if (slot.weapon === null) { assert.deepEqual([slot.weaponUid, slot.gun], [null, null], name); continue; }
        assert.deepEqual(slot.gun, factoryState(), name); assert.deepEqual(validateGun(slot.weapon, slot.weaponUid, slot.gun), { ok: true });
    }
    assert.deepEqual(now.slots.filter(s => s.weapon !== null).map(s => s.weaponUid), equipped, name);
    assert.equal(JSON.stringify(decodeSession(text, resolve)), JSON.stringify(after), `${name}: deterministic`);
    const p = opened(text, resolve);
    assert.equal(p.initialized, true, name); assert.equal(JSON.parse(p.raw).version, 8, name);
    const written = p.record;
    assert.equal(written.gunsBackup, after.gunsBackup, name);
    assert.deepEqual([written.legacyBackup, written.migrationBackup, written.systemsBackup, written.perksBackup, written.enemyBackup],
        [after.legacyBackup, after.migrationBackup, after.systemsBackup, after.perksBackup, after.enemyBackup], name);
    assert.deepEqual([written.profile, written.raid, written.terminal], [after.profile, after.raid, after.terminal], name);
    assert.ok(p.saves.persist(), name); assert.equal(p.record.gunsBackup, after.gunsBackup, `${name}: never replaced by a v8 text`);
    const again = opened(p.raw, resolve);
    assert.deepEqual(again.state.save, p.state.save, name); assert.equal(again.record.gunsBackup, after.gunsBackup, name);
    return { stored, after, page: again };
}

test('the old guns are exactly the guns that were items before the catalog', () => {
    // M2-01 made G17 and M4A1 items too, but no save before v8 can hold them: they are guns and never old guns.
    const added = ['gb17', 'mb4a1'];
    assert.deepEqual([...OLD_GUNS].sort(), Object.keys(D.WEAPONS).filter(id => D.isGun(id) && !added.includes(id)).sort());
    for (const id of OLD_GUNS) { assert.ok(isGunId(id) && Object.hasOwn(D.ITEMS, id)); assert.deepEqual(GUNS[id].stats, D.WEAPONS[id]); }
    assert.ok(Object.keys(GUNS).filter(id => Object.hasOwn(D.ITEMS, id)).every(id => OLD_GUNS.includes(id as never) || added.includes(id)));
    for (const id of added) assert.ok(D.isGun(id) && !OLD_GUNS.includes(id as never), id);
});

test('new saves: the starter pistol is a factory instance; old new-game, station and fresh-start records migrate on read', () => {
    const save = D.newSave();
    assert.equal(save.version, 3); assert.ok(save.equipment.weaponUid); assert.deepEqual(save.equipment.gun, factoryState());
    assert.deepEqual(migrateProfile(save), save, 'a v3 profile comes back as an equal checked copy');
    const v2 = oldProfile(save), v3 = migrateProfile(v2);
    assert.equal(v3.equipment.weaponUid, 'gun-v6'); assert.deepEqual(oldProfile(v3), v2);
    assert.equal(Object.hasOwn(prove('new game, session v3', old('newGameV3')).after, 'expansion'), false);
    prove('first station entry, session v5', old('stationV5'));
    prove('fresh start, session v5', old('freshStartV5'));
});

test('an old settled save: guns everywhere become factory instances; cash, places, rotation, relief, magazine and the result stay', () => {
    const { stored, after } = prove('settled v5', old('settledV5')), a = after.profile, b = stored.profile;
    assert.deepEqual([a.cash, a.activeRun, a.quests.repair], [4321, null, true]);
    assert.deepEqual(after.terminal, stored.terminal); assert.equal(after.terminal!.outcome, 'extract');
    assert.deepEqual(a.lastResult, b.lastResult); assert.deepEqual(a.stats, b.stats);
    for (const name of ['stash', 'bag', 'safe'] as const) {
        assert.deepEqual(a[name].items.map(i => [i.uid, i.id, i.qty, i.x, i.y, i.relief, i.rotated]), b[name].items.map((i: D.Item) => [i.uid, i.id, i.qty, i.x, i.y, i.relief, i.rotated]), name);
    }
    assert.deepEqual(a.stash.items.filter(i => isGunId(i.id)).map(i => [i.id, !!i.rotated, !!i.relief]), [['carbine', true, false], ['pistol', false, true]]);
    assert.deepEqual([D.count(a.bag, 'ammoR'), D.count(a.bag, 'shotgun'), D.count(a.safe, 'pistol')], [13, 1, 1]);
    // The extracted magazine keeps its count and its relief rounds; the gun got the one new uid.
    assert.deepEqual([a.equipment.weapon, a.equipment.ammo, a.equipment.ammoRelief, a.equipment.relief, a.equipment.weaponUid], ['carbine', 12, 5, false, 'gun-v6']);
    assert.deepEqual(after.expansion, stored.expansion);
});

test('old settled backup files: the profile file and the recovery file give the same guns, and both still import', () => {
    const fromFile = decodeBackup(old('settledProfileFile')), settled = decodeSession(old('settledV5'));
    assert.equal(JSON.parse(old('settledProfileFile')).formatVersion, 2);
    assert.deepEqual(fromFile, settled.profile, 'the same save migrates the same way inside and outside a record');
    assert.deepEqual(oldProfile(fromFile), SAVES.settledProfileFile.save);
    const recovery = decodePortableBackup(old('settledRecoveryFile'));
    assert.equal(recovery.kind, 'session'); if (recovery.kind !== 'session') return;
    assert.deepEqual([recovery.record.version, recovery.record.gunsBackup], [8, inner('settledRecoveryFile')]);
    assert.deepEqual(recovery.record.profile, settled.profile);
    // The yard previews and imports the old full backup; the store keeps its own recovery bytes, the backup's are dropped.
    const yard = page(), guns = yard.record.gunsBackup;
    assert.ok(importText(yard, old('settledRecoveryFile')).ok);
    assert.deepEqual([yard.record.version, yard.record.gunsBackup, yard.record.profile.equipment.weaponUid], [8, guns, 'gun-v6']);
    assert.equal(yard.state.save.cash, 4321);
    // The old tab page takes the old settled profile file (no expansion there yet); it is written as v8.
    const tabs = page(origin(), false); tabs.state.state = 'hideout';
    assert.ok(tabs.saves.importSave(decodeBackup(old('settledProfileFile'))));
    assert.deepEqual(tabs.record.profile, fromFile); assert.equal(tabs.record.version, 8);
    // Export after import: a v8 recovery file that reads back the same and imports into another save.
    const exported = yard.runtime.exportBackup(), file = JSON.parse(exported);
    assert.deepEqual([file.formatVersion, file.record.version, file.record.profile.version], [8, 8, 3]);
    const other = page(); assert.ok(importText(other, exported).ok); assert.deepEqual(other.state.save, yard.state.save);
    // A settled profile file (v3) round trips too.
    const v3file = JSON.stringify({ format: 'escape-bincov-backup', formatVersion: 3, createdAt: new Date(NOW).toISOString(), save: fromFile });
    assert.deepEqual(decodeBackup(v3file), fromFile);
});

test('an active layered raid migrates in place: RNG, serials, clock and rules identity stay, and it plays on to extraction', () => {
    const { stored, after } = prove('live building raid v5', old('liveRaidV5'));
    const raid = after.expansion!.raid!, was = stored.expansion.raid;
    assert.deepEqual([after.expansion!.version, raid.version], [3, 3]);
    assert.deepEqual([raid.rng, raid.nextEntity, raid.elapsed, raid.seed, raid.runId, raid.currentMap], [was.rng, was.nextEntity, was.elapsed, was.seed, was.runId, was.currentMap]);
    assert.deepEqual([raid.loadout.weaponUid, raid.loadout.weapon, raid.loadout.ammo, raid.loadout.ammoRelief], ['gun-v6', 'carbine', 12, 5]);
    assert.deepEqual([after.profile.equipment.weaponUid, after.profile.equipment.weapon], [null, null]);
    const ground = Object.values(raid.maps).flatMap(m => m.loot).filter(l => isGunId(l.id));
    assert.ok(ground.some(l => l.id === 'shotgun' && l.uid.startsWith(`entity-${raid.runId}-`)));
    ground.forEach(l => assert.deepEqual(l.gun, factoryState(), l.uid));
    const crated = Object.values(raid.maps).flatMap(m => m.containers.flatMap(c => c.inventory.items)).filter(i => i.id === 'pistol' && i.relief);
    assert.equal(crated.length, 1); assert.deepEqual(crated[0].gun, factoryState());
    // The profile's safe mirrors the loadout's safe, gun state included.
    assert.deepEqual(after.profile.safe, raid.loadout.safe); assert.ok(raid.loadout.safe.items.some(i => i.id === 'pistol' && i.gun));
    // The raid resumes on the Runtime and extracts: every carried gun comes home once, under the uid it had.
    const p = opened(old('liveRaidV5')), carried = [...raid.loadout.bag.items, ...raid.loadout.safe.items].filter(i => isGunId(i.id)).map(i => i.uid);
    assert.ok(p.saves.resumeRun()); p.state.state = 'run';
    const runtime = new CoastRaidRuntime(p.state, p.saves); runtime.freezeAI = true;
    assert.equal(runtime.checkpoint(), true); runtime.finish('extract');
    assert.equal(runtime.settlement.committed, true); runtime.dispose();
    const home = p.record.profile;
    assert.deepEqual(gunUids(home), [...after.profile.stash.items.filter(i => isGunId(i.id)).map(i => i.uid), ...carried, 'gun-v6'].sort());
    assert.equal(home.cash, after.profile.cash); assert.equal(home.equipment.weaponUid, 'gun-v6'); assert.equal(home.equipment.ammoRelief, 5);
});

test('the previous client\'s v4 raid and the M0 prototype raid keep their expansion and raid versions through the migration', () => {
    const v4 = prove('live raid, session v4', asV4(old('liveRaidV5'))).after;
    assert.deepEqual([v4.expansion!.version, v4.expansion!.raid!.version, Object.hasOwn(v4, 'perksBackup'), Object.hasOwn(v4, 'systemsBackup')], [2, 2, false, true]);
    const v1 = prove('prototype raid, session v4', old('prototypeV4'), prototype).after;
    assert.deepEqual([v1.expansion!.version, v1.expansion!.raid!.version, v1.expansion!.raid!.maps.downstairs.bullets.length], [1, 1, 2]);
});

test('an active classic raid: the checkpoint keeps its loadout, a relief carbine on the ground and a shotgun in a crate; a death keeps only the safe', () => {
    const { stored, after } = prove('live classic raid', old('classicRaidV5'));
    const c = after.raid!, was = stored.raid;
    assert.equal(after.expansion!.raid, null); assert.equal(after.expansion!.base.location, 'raid');
    assert.deepEqual([c.version, c.worldVersion, c.rng, c.nextEntity, c.elapsed, c.kills], [was.version, was.worldVersion, was.rng, was.nextEntity, was.elapsed, was.kills]);
    const carbine = c.loot.find(l => l.uid === 'loot-900')!;
    assert.equal(carbine.relief, true); assert.deepEqual(carbine.gun, factoryState());
    assert.ok(c.loot.filter(l => isGunId(l.id)).every(l => l.gun), 'world-born ground guns too');
    const crated = c.containers!.flatMap(x => x.inventory.items).filter(i => i.id === 'shotgun');
    assert.ok(crated.length >= 1); crated.forEach(i => assert.deepEqual(i.gun, factoryState()));
    assert.deepEqual([c.loadout.weaponUid, c.loadout.ammo, c.loadout.ammoRelief], ['gun-v6', 12, 5]);
    assert.deepEqual(after.profile.safe, c.loadout.safe);
    // Resumed and lost: the bag and the equipped gun go, the safe's pistol stays under its uid.
    const p = opened(old('classicRaidV5'));
    assert.ok(p.saves.resumeRun()); p.state.state = 'run';
    const runtime = new CoastRaidRuntime(p.state, p.saves); runtime.freezeAI = true; runtime.finish('death'); runtime.dispose();
    const home = p.record.profile, safe = c.loadout.safe.items.filter(i => isGunId(i.id)).map(i => i.uid);
    assert.deepEqual(gunUids(home), [...after.profile.stash.items.filter(i => isGunId(i.id)).map(i => i.uid), ...safe].sort());
    assert.equal(home.equipment.weapon, null);
});

test('a pending settlement exported by the old client imports once: the terminal, the money and every gun count once', () => {
    const file = old('pendingSettlementFile'), decoded = decodePortableBackup(file);
    assert.equal(decoded.kind, 'session'); if (decoded.kind !== 'session') return;
    const record = decoded.record;
    assert.deepEqual([record.version, record.gunsBackup, record.terminal!.outcome, record.terminal!.reason, record.expansion!.base.location, record.expansion!.raid], [8, inner('pendingSettlementFile'), 'extract', 'extract', 'settlement', null]);
    assert.deepEqual([record.profile.activeRun, record.raid, record.profile.equipment.weaponUid, record.profile.equipment.ammo, record.profile.equipment.ammoRelief], [null, null, 'gun-v6', 12, 5]);
    assert.deepEqual(oldRecord(record, 5), SAVES.pendingSettlementFile.record);
    const yard = page(); assert.ok(importText(yard, file).ok);
    const imported = yard.record.profile;
    assert.deepEqual(gunUids(imported), gunUids(record.profile)); assert.equal(imported.cash, record.profile.cash);
    assert.equal(yard.record.terminal!.outcome, 'extract'); assert.equal(yard.state.expansion!.base.location, 'base');
    // Importing the same file again replaces, never adds.
    assert.ok(importText(yard, file).ok); assert.deepEqual(gunUids(yard.record.profile), gunUids(record.profile)); assert.equal(yard.record.profile.cash, record.profile.cash);
});

test('a settlement of a migrated raid that fails to write is retried once: no item or money twice', () => {
    const p = opened(old('liveRaidV5')), before = p.record;
    assert.ok(p.saves.resumeRun()); p.state.state = 'run';
    p.o.failing.add(SESSION_KEY);
    assert.ok(p.saves.prepareSettlement('extract', 0)); assert.equal(p.saves.retrySettlement(), false);
    assert.deepEqual(p.record, before, 'the failed write left the stored record');
    const backup = decodeSession(JSON.stringify(p.saves.backupRecord()));
    assert.deepEqual(gunUids(backup.profile), gunUids(p.state.pendingSettlement!));
    p.o.failing.delete(SESSION_KEY);
    assert.ok(p.saves.retrySettlement()); const settled = p.record;
    assert.equal(p.saves.retrySettlement(), false); assert.deepEqual(p.record, settled, 'a second retry writes nothing');
    const ids = gunUids(settled.profile);
    assert.equal(new Set(ids).size, ids.length); assert.equal(settled.profile.cash, before.profile.cash);
    assert.equal(D.count(settled.profile.bag, 'shotgun'), 1); assert.equal(settled.profile.equipment.weaponUid, 'gun-v6');
});

test('a record carrying every earlier backup keeps them verbatim and adds its own bytes; v2 records and the legacy key keep theirs once', () => {
    const text = old('chainV5'), chain = SAVES.chainV5, { after } = prove('every backup, session v5', text);
    assert.deepEqual([after.legacyBackup, after.migrationBackup, after.systemsBackup, after.perksBackup, after.gunsBackup], [chain.legacyBackup, chain.migrationBackup, chain.systemsBackup, chain.perksBackup, text]);
    assert.deepEqual([JSON.parse(chain.migrationBackup).version, JSON.parse(chain.systemsBackup).version, JSON.parse(chain.perksBackup).version], [2, 3, 4]);
    assert.equal(after.profile.cash, 1842);
    // The embedded records read on their own, each migrated: v2 keeps its bytes in migrationBackup, so gunsBackup is null.
    const v2 = decodeSession(chain.migrationBackup);
    assert.deepEqual([v2.version, v2.migrationBackup, v2.gunsBackup], [8, chain.migrationBackup, null]);
    assert.ok(v2.profile.stash.items.some(i => i.id === 'pistol' && i.gun));
    for (const embedded of [chain.systemsBackup, chain.perksBackup]) { const r = decodeSession(embedded); assert.deepEqual([r.version, r.gunsBackup], [8, embedded]); }
    // The legacy key (profile v1) migrates through migrateSave: the equipped pistol and the stored one become instances.
    const o = origin(); o.data.set(D.SAVE_KEY, chain.legacyBackup);
    const legacy = page(o, false); assert.equal(legacy.initialized, true);
    assert.deepEqual([legacy.record.version, legacy.record.legacyBackup, legacy.record.gunsBackup, legacy.state.save.equipment.weaponUid], [8, chain.legacyBackup, null, 'gun-v6']);
    assert.ok(legacy.state.save.stash.items.some(i => i.id === 'pistol' && i.gun));
    assert.deepEqual(legacy.state.save, migrateProfile(D.cleanOldSave(JSON.parse(chain.legacyBackup))));
});

test('the first v8 write can fail: the old bytes stay stored and the retry writes v8 with them once', () => {
    const text = old('liveRaidV5'), o = origin(); o.data.set(SESSION_KEY, text); o.failing.add(SESSION_KEY);
    const p = page(o, false);
    assert.equal(p.initialized, false); assert.equal(p.raw, text); assert.equal(p.state.storageOK, false);
    o.failing.delete(SESSION_KEY); assert.ok(p.saves.persist());
    const written = p.raw;
    assert.deepEqual([JSON.parse(written).version, p.record.gunsBackup], [8, text]);
    // A store that read the old bytes before that write cannot overwrite the v8 record (compare before write).
    o.data.set(SESSION_KEY, text); const behind = new RecoveryStore(o.storage); const loaded = behind.load(); o.data.set(SESSION_KEY, written);
    assert.equal(behind.record!.gunsBackup, text);
    assert.throws(() => behind.commit(loaded.save, null), /另一窗口已修改存档/); assert.equal(o.data.get(SESSION_KEY), written);
});

test('deterministic and idempotent: the same result every time, no clock or random numbers, nothing new on a second run', () => {
    const text = old('liveRaidV5'), stored: RecordV7 = JSON.parse(text), fresh = oldProfile(D.newSave());
    const random = Math.random, now = Date.now;
    let runs: string[];
    try {
        Math.random = () => { throw new Error('random'); }; Date.now = () => { throw new Error('clock'); };
        runs = [0, 1, 2].map(() => JSON.stringify(migrateRecord(stored, text)));
        const once = migrateRecord(stored, text);
        assert.deepEqual(migrateRecord(migrateRecord(once, text), text), once);
        const profile = migrateProfile(fresh);
        assert.deepEqual(migrateProfile(migrateProfile(profile)), profile);
        assert.deepEqual(migrateRecord(once, 'other bytes'), once, 'a v8 record ignores the offered bytes');
    } finally { Math.random = random; Date.now = now; }
    assert.equal(new Set(runs).size, 1);
    assert.deepEqual(stored, JSON.parse(text), 'the input is not changed');
    assert.equal(JSON.stringify(decodeSession(text)), runs[0], 'decodeSession gives what migrateRecord gives the checked old record');
});

test('the equipped gun\'s uid avoids every string already in the save', () => {
    const save = oldProfile(D.newSave()) as ProfileV2;
    save.stash.items[0].uid = 'gun-v6'; assert.equal(migrateProfile(save).equipment.weaponUid, 'gun-v6-2');
    save.bag.items[0].uid = 'gun-v6-2'; assert.equal(migrateProfile(save).equipment.weaponUid, 'gun-v6-3');
    save.lastResult = { outcome: 'extract', kills: 0, keptValue: 0, lostValue: 0, message: 'gun-v6-3', seed: 1, recovered: false };
    assert.equal(migrateProfile(save).equipment.weaponUid, 'gun-v6-4', 'any string counts, not only uids');
    const record = JSON.parse(old('liveRaidV5')), raid = record.expansion.raid;
    (Object.values(raid.maps) as any[]).flatMap(m => m.containers.flatMap((c: any) => c.inventory.items))[0].uid = 'gun-v6';
    assert.equal(decodeSession(JSON.stringify(record)).expansion!.raid!.loadout.weaponUid, 'gun-v6-2');
});

test('a legacy-key v0/v1 profile holding a gun field is refused at load, never stripped by the old repair, and its bytes stay', () => {
    // No client before gun instances wrote these fields (M0 review, decision 2). Version 2 is checked strictly and refused
    // them already; v0/v1 went through the lenient repair (migrateSave), which dropped them silently (M1-08 save review, p3).
    const v1 = { version: 1, cash: 900, upgraded: false, activeRun: null, settings: { volume: .3 }, stats: { runs: 1, extracts: 1, kills: 0 },
        quests: { repair: false, sample: false, ledger: false }, stash: { w: 10, h: 6, items: [{ uid: 'c1', id: 'carbine', qty: 1, x: 0, y: 0 }] },
        bag: { w: 6, h: 5, items: [{ uid: 'b1', id: 'pistol', qty: 1, x: 0, y: 0 }] }, safe: { w: 2, h: 2, items: [{ uid: 's1', id: 'ammo9', qty: 5, x: 0, y: 0 }] },
        equipment: { weapon: 'carbine', relief: false, ammo: 3, ammoRelief: 0 } };
    const muzzle = () => ({ parts: [{ uid: 'p1', id: 'M05', slot: 'muzzle', relief: false, children: [] }], devices: { laser: false, light: false } });
    const faults: [string, (p: any) => void][] = [
        ['a stash gun holding a fitted state', p => { p.stash.items[0].gun = muzzle(); }],
        ['a bag gun holding a factory state', p => { p.bag.items[0].gun = factoryState(); }],
        ['a safe item holding a null state', p => { p.safe.items[0].gun = null; }],
        ['the slot holding a uid', p => { p.equipment.weaponUid = 'x1'; }],
        ['the slot holding a state', p => { p.equipment.gun = factoryState(); }],
        ['a version 0 inventory gun holding a state', p => { delete p.version; p.inventory = p.stash; delete p.stash; p.inventory.items[0].gun = muzzle(); }],
        ['a version 0 bare list holding a state', p => { p.version = 0; p.bag = [{ ...p.bag.items[0], gun: factoryState() }]; }],
    ];
    for (const [why, mutate] of faults) {
        const p = structuredClone(v1) as any; mutate(p); const text = JSON.stringify(p), o = origin(); o.data.set(D.SAVE_KEY, text);
        assert.throws(() => new RecoveryStore(o.storage).load(), UNREADABLE, why);
        const loaded = page(o, false);
        assert.equal(loaded.initialized, false, why); assert.equal(o.data.get(D.SAVE_KEY), text, why); assert.equal(o.data.has(SESSION_KEY), false, why);
    }
    // The control: the same profile without those fields loads, every gun a factory instance (the stored one keeps its uid).
    const o = origin(); o.data.set(D.SAVE_KEY, JSON.stringify(v1)); const fine = page(o, false);
    assert.ok(fine.initialized); assert.equal(fine.record.legacyBackup, JSON.stringify(v1));
    assert.deepEqual(fine.record.profile.stash.items.find(i => i.uid === 'c1')?.gun, factoryState());
    assert.deepEqual([fine.record.profile.equipment.weaponUid, fine.record.profile.equipment.gun], ['gun-v6', factoryState()]);
});

test('old formats holding gun fields, and unknown or malformed inputs, are refused, never repaired', () => {
    const save = oldProfile(D.newSave()) as ProfileV2, v3 = migrateProfile(save), text = old('liveRaidV5'), live: RecordV7 = JSON.parse(text);
    const v8 = migrateRecord(live, text);
    const refuse = <T>(base: T, run: (value: T) => unknown, faults: [string, (value: any) => void][], pattern = REFUSED) => {
        for (const [why, mutate] of faults) {
            const value = structuredClone(base); mutate(value);
            assert.throws(() => run(value), pattern, why);
        }
    };
    for (const value of [null, undefined, 'x', [], 5, {}]) {
        assert.throws(() => migrateProfile(value as never), REFUSED); assert.throws(() => migrateRecord(value as never, null), REFUSED);
    }
    for (const version of [0, 1, 4, '2', undefined]) assert.throws(() => migrateProfile({ ...save, version } as never), REFUSED, String(version));
    for (const version of [1, 2, 9, '5', null]) assert.throws(() => migrateRecord({ ...live, version } as never, text), REFUSED, String(version));
    refuse(save, migrateProfile, [
        ['an old item already holding a gun state', p => { p.stash.items.push({ uid: 'x1', id: 'pistol', qty: 1, x: 0, y: 5, gun: factoryState() }); }],
        ['an old slot holding a uid', p => { p.equipment.weaponUid = 'x1'; }],
        ['an old slot holding a gun state', p => { p.equipment.gun = null; }],
        ['a catalog gun no old save can hold', p => { p.stash.items.push({ uid: 'x1', id: 'gb17', qty: 1, x: 0, y: 5 }); }],
        ['an equipped catalog gun no old save can hold', p => { p.equipment.weapon = 'mb4a1'; }],
        ['an attachment no old save can hold (M2-02)', p => { p.stash.items.push({ uid: 'x1', id: 'O03', qty: 1, x: 0, y: 5 }); }],
        ['an equipped knife', p => { p.equipment.weapon = 'knife'; }], ['the sample rifle', p => { p.equipment.weapon = 'm4a1'; }],
        ['a prototype name', p => { p.equipment.weapon = '__proto__'; }], ['no equipped field', p => { delete p.equipment.weapon; }],
        ['no stash', p => { delete p.stash; }], ['items not a list', p => { p.bag.items = {}; }], ['an item not an object', p => { p.safe.items.push(7); }],
        ['no equipment', p => { delete p.equipment; }], ['two items with one uid', p => { p.bag.items[1].uid = p.bag.items[0].uid; }],
        ['a gun sharing an item uid', p => { p.stash.items.push({ uid: p.bag.items[0].uid, id: 'shotgun', qty: 1, x: 0, y: 5 }); }],
    ]);
    refuse(v3, migrateProfile, [
        ['a gun item without its state', p => { p.stash.items.push({ uid: 'x1', id: 'pistol', qty: 1, x: 0, y: 5 }); }],
        ['another item with a gun state', p => { p.bag.items[0].gun = factoryState(); }],
        ['an equipped gun without a uid', p => { p.equipment.weaponUid = null; }],
        ['an equipped gun without a state', p => { p.equipment.gun = null; }],
        ['no gun, yet a uid', p => { Object.assign(p.equipment, { weapon: null, weaponUid: 'x1', gun: null }); }],
        ['a slot key missing', p => { delete p.equipment.weaponUid; }],
        ['an unknown part', p => { p.equipment.gun.parts.push({ uid: 'p1', id: 'Z99', slot: 'muzzle', relief: false, children: [] }); }],
        ['a part sharing an item uid', p => { p.equipment.gun.parts.push({ uid: p.bag.items[0].uid, id: 'M01', slot: 'muzzle', relief: false, children: [] }); }],
        ['a device on with nothing to switch', p => { p.equipment.gun.devices.laser = true; }],
    ]);
    const layer = (r: any) => r.expansion.raid.maps[r.expansion.raid.currentMap];
    const ground = (r: any) => layer(r).loot.find((l: any) => l.id === 'shotgun');
    const crate = (r: any) => Object.values(r.expansion.raid.maps).flatMap((m: any) => m.containers).find((c: any) => c.inventory.items.length) as any;
    const oldFaults: [string, (value: any) => void][] = [
        ['a v3 profile in an old record', r => { r.profile.version = 3; }],
        ['gunsBackup in an old record', r => { r.gunsBackup = null; }], ['v5 holding a v2 expansion', r => { r.expansion.version = 2; }],
        ['v4 holding a v3 expansion', r => { r.version = 4; }], ['v3 holding an expansion', r => { r.version = 3; }],
        ['v7 without enemyBackup', r => { r.version = 7; }], ['v5 holding enemyBackup', r => { r.enemyBackup = null; }],
        ['v6 holding a v3 expansion', r => { r.version = 6; r.enemyBackup = null; }],
        ['an old ground gun holding a state', r => { ground(r).gun = factoryState(); }],
        ['an old crate item holding a state', r => { crate(r).inventory.items[0].gun = factoryState(); }],
        ['an old loadout holding a uid', r => { r.expansion.raid.loadout.weaponUid = 'x1'; }],
        ['a loadout gun no old save can hold', r => { r.expansion.raid.loadout.weapon = 'mb4a1'; }],
        ['an old crate holding an attachment (M2-02)', r => { crate(r).inventory.items[0].id = 'S01'; crate(r).inventory.items[0].qty = 1; }],
        ['a charm that is a gun', r => { r.expansion.charm = { uid: 'c1', id: 'pistol', qty: 1, x: 0, y: 0 }; }],
        ['a charm sharing a stored gun\'s uid', r => { r.expansion.charm = { uid: r.profile.stash.items.find((i: any) => i.id === 'carbine').uid, id: 'luckyCharm', qty: 1, x: 0, y: 0 }; }],
    ];
    refuse(live, r => migrateRecord(r, text), [
        ['another format', r => { r.format = 'escape-bincov-backup'; }], ...oldFaults,
        ['v4 without an expansion', r => { r.version = 4; delete r.expansion; }], ['a null expansion', r => { r.expansion = null; }],
        ['ground loot not a list', r => { layer(r).loot = {}; }], ['a crate without its inventory', r => { delete crate(r).inventory; }],
        ['a map that is not an object', r => { r.expansion.raid.maps[r.expansion.raid.currentMap] = 5; }],
        ['a classic checkpoint that is not an object', r => { r.raid = 5; }],
    ]);
    // The same faults in stored bytes: decodeSession refuses the record as unreadable, and the stored bytes stay.
    refuse(live, r => decodeSession(JSON.stringify(r)), oldFaults, /无法读取这份存档|存档格式不支持|建筑、角色或基地存档损坏/);
    for (const [why, mutate] of oldFaults.slice(0, 3)) {
        const r = structuredClone(live); mutate(r); const corrupt = JSON.stringify(r), o = origin(); o.data.set(SESSION_KEY, corrupt);
        const p = page(o, false); assert.equal(p.initialized, false, why); assert.equal(o.data.get(SESSION_KEY), corrupt, why);
    }
    assert.throws(() => migrateRecord(live, 5 as never), REFUSED, 'gunsBackup must be text or null');
    refuse(v8, r => migrateRecord(r, text), [
        ['no gunsBackup', r => { delete r.gunsBackup; }], ['gunsBackup not text', r => { r.gunsBackup = 5; }],
        ['a v2 profile', r => { r.profile.version = 2; }], ['a ground gun without its state', r => { delete ground(r).gun; }],
        ['a loadout gun with a part for another gun', r => { r.expansion.raid.loadout.gun.parts.push({ uid: 'p1', id: 'M11', slot: 'muzzle', relief: false, children: [] }); }],
        ['the mirrored safe losing a state', r => { delete r.profile.safe.items.find((i: any) => i.id === 'pistol').gun; }],
        ['two guns sharing a part uid', r => {
            const part = () => ({ uid: 'p-shared', id: 'M05', slot: 'muzzle', relief: false, children: [] });
            r.expansion.raid.loadout.gun.parts.push(part()); r.profile.stash.items.find((i: any) => i.id === 'carbine').gun.parts.push(part());
        }],
    ]);
    // The same additions are legal one at a time, so each refusal above is for the fault it names.
    const single = structuredClone(v8) as any;
    single.expansion.raid.loadout.gun.parts.push({ uid: 'p-shared', id: 'M05', slot: 'muzzle', relief: false, children: [] });
    assert.deepEqual(migrateRecord(single, null), single);
    // Settled profile files: an old one holding a gun field is refused whole; so is an unknown version.
    const file = JSON.parse(old('settledProfileFile'));
    for (const [why, mutate] of [
        ['a gun state on an old item', (f: any) => { f.save.stash.items.find((i: any) => i.id === 'carbine').gun = factoryState(); }],
        ['a uid on an old slot', (f: any) => { f.save.equipment.weaponUid = 'x1'; }],
        ['a gun state on an old slot', (f: any) => { f.save.equipment.gun = factoryState(); }],
        ['a v3 profile labelled v2', (f: any) => { f.save = { ...decodeBackup(old('settledProfileFile')), version: 2 }; }],
    ] as const) { const f = structuredClone(file); mutate(f); assert.throws(() => decodeBackup(JSON.stringify(f, null, 2)), REFUSED, why); }
    assert.throws(() => decodeBackup(JSON.stringify({ ...file, formatVersion: 4, save: { ...file.save, version: 4 } })), /不兼容的版本/);
    assert.throws(() => decodeStoredProfile({ ...v3, version: 2 }), REFUSED, 'a v3 profile carrying gun fields read as v2');
    // An unknown version, and a v8 record relabelled as one of the enemy client's (v7, its profile still v3).
    assert.throws(() => decodeSession(JSON.stringify({ ...v8, version: 9 })), UNREADABLE);
    assert.throws(() => decodePortableBackup(envelope({ ...v8, version: 9 })), /不兼容的版本/);
    assert.throws(() => decodeSession(JSON.stringify({ ...v8, version: 7, enemyBackup: null })), UNREADABLE);
});

test('a v8 record breaking the gun or record rules is refused before anything trusts it, and its bytes stay', () => {
    const v8 = decodeSession(old('liveRaidV5')), classic = decodeSession(old('classicRaidV5')), bare = decodeSession(old('newGameV3'));
    const charm = (uid: string) => ({ uid, id: 'luckyCharm', qty: 1, x: 0, y: 0 });
    const part = (uid: string, id: string) => ({ uid, id, slot: 'muzzle', relief: false, children: [] });
    const faults: [string, SessionRecord, (r: any) => void][] = [
        ['a stored gun without its state', v8, r => { delete r.profile.stash.items.find((i: any) => i.id === 'carbine').gun; }],
        ['a medkit with a gun state', v8, r => { r.profile.stash.items.find((i: any) => i.id === 'medkit').gun = factoryState(); }],
        ['a gun state with an extra key', v8, r => { r.profile.stash.items.find((i: any) => i.id === 'carbine').gun.extra = 1; }],
        ['a loadout without weaponUid', v8, r => { delete r.expansion.raid.loadout.weaponUid; }],
        ['an equipped uid shared with a stored item', v8, r => { r.expansion.raid.loadout.weaponUid = r.profile.stash.items[0].uid; }],
        ['an equipped uid shared with an entity', v8, r => { r.expansion.raid.loadout.weaponUid = r.expansion.raid.roster[0].uid; }],
        ['a part uid shared with ground loot', v8, r => {
            r.expansion.raid.loadout.gun.parts.push({ uid: r.expansion.raid.maps[r.expansion.raid.currentMap].loot[0].uid, id: 'M05', slot: 'muzzle', relief: false, children: [] });
        }],
        ['a ground gun without its state', v8, r => { delete r.expansion.raid.maps[r.expansion.raid.currentMap].loot.find((l: any) => l.id === 'shotgun').gun; }],
        ['ground loot with a gun state', v8, r => { const l = r.expansion.raid.maps[r.expansion.raid.currentMap].loot.find((x: any) => x.id !== 'shotgun'); l.gun = factoryState(); }],
        ['a device switched on without a device', v8, r => { r.profile.safe.items.find((i: any) => i.id === 'pistol').gun.devices.light = true; r.expansion.raid.loadout.safe.items.find((i: any) => i.id === 'pistol').gun.devices.light = true; }],
        ['the mirrored safe differing in the gun state', v8, r => { r.profile.safe.items.find((i: any) => i.id === 'pistol').gun.parts.push({ uid: 'p1', id: 'M01', slot: 'muzzle', relief: false, children: [] }); }],
        ['a classic ground gun without its state', classic, r => { delete r.raid.loot.find((l: any) => l.uid === 'loot-900').gun; }],
        ['a classic item uid equal to a ground uid', classic, r => { r.raid.loadout.bag.items[0].uid = r.raid.loot[0].uid; r.profile.stash.items = r.profile.stash.items.filter((i: any) => i.uid !== r.raid.loot[0].uid); }],
        ['a classic crate gun without its state', classic, r => { delete r.raid.containers.flatMap((c: any) => c.inventory.items).find((i: any) => i.id === 'shotgun').gun; }],
        // A dropped gun keeps its item uid on the ground (M1-04), so it could name a crate; every pickup write then failed (M1-08 review).
        ['a classic ground gun uid equal to a crate id', classic, r => { r.raid.loot.find((l: any) => l.uid === 'loot-900').uid = r.raid.containers[0].id; }],
        // The charm against a classic raid's gear (the gun, a bag item, a part): a settlement then failed for good (M1-08 review).
        ['a charm uid equal to the classic raid\'s gun', classic, r => { r.expansion.charm = charm(r.raid.loadout.weaponUid); }],
        ['a charm uid equal to a classic bag item', classic, r => { r.expansion.charm = charm(r.raid.loadout.bag.items[0].uid); }],
        ['a charm uid equal to a part of the classic raid\'s gun', classic, r => { r.raid.loadout.gun.parts.push(part('p-charm', 'M05')); r.expansion.charm = charm('p-charm'); }],
        ['a charm uid equal to a part of a classic bag gun', classic, r => {
            r.raid.loadout.bag.items.find((i: any) => i.id === 'shotgun').gun.parts.push(part('p-charm', 'M11')); r.expansion.charm = charm('p-charm');
        }],
        ['a v8 record without gunsBackup', v8, r => { delete r.gunsBackup; }],
        ['a v8 record with a v2 profile', v8, r => { r.profile.version = 2; }],
        ['a v3 expansion without perksBackup', v8, r => { delete r.perksBackup; }],
        ['perksBackup beside a v2 expansion', v8, r => { r.expansion.version = 2; delete r.expansion.growth.perks; r.expansion.raid.version = 2; }],
        ['enemyBackup that is not text', v8, r => { r.enemyBackup = 5; }],
        ['enemy rules without an expansion', bare, r => { r.enemyBackup = null; }],
        ['a live enemy raid without enemy rules', v8, r => { r.expansion.raid.version = 5; }],
    ];
    for (const [why, base, mutate] of faults) {
        const r = structuredClone(base); mutate(r); const corrupt = JSON.stringify(r);
        assert.throws(() => decodeSession(corrupt), why);
        const o = origin(); o.data.set(SESSION_KEY, corrupt);
        const p = page(o, false); assert.equal(p.initialized, false, why); assert.equal(o.data.get(SESSION_KEY), corrupt, why);
    }
    assert.doesNotThrow(() => decodeSession(JSON.stringify(v8))); assert.doesNotThrow(() => decodeSession(JSON.stringify(classic)));
    // The controls: the same ground gun under an item uid nobody else holds is fine, and so are the parts beside a charm of its own.
    const renamed = structuredClone(classic) as any; renamed.raid.loot.find((l: any) => l.uid === 'loot-900').uid = 'dropped-carbine';
    assert.doesNotThrow(() => decodeSession(JSON.stringify(renamed)));
    const worn = structuredClone(classic) as any; worn.raid.loadout.gun.parts.push(part('p-own', 'M05')); worn.expansion.charm = charm('charm-own');
    assert.doesNotThrow(() => decodeSession(JSON.stringify(worn)));
    // The bag item variant was open before gun instances too (main 67a7468): the old rules refuse it now, bytes kept.
    const stored = JSON.parse(old('classicRaidV5')); stored.expansion.charm = charm(stored.raid.loadout.bag.items[0].uid);
    const corrupt = JSON.stringify(stored), o = origin(); o.data.set(SESSION_KEY, corrupt);
    assert.throws(() => decodeSession(corrupt)); assert.equal(page(o, false).initialized, false); assert.equal(o.data.get(SESSION_KEY), corrupt);
});
