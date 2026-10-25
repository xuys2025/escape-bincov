import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { ENEMY_CATALOG } from '../scripts/enemy-catalog-data';
import type { EnemyState } from '../src/checkpoint';
import { BUILDING_WORLD } from '../src/building-world';
import { changeLayer } from '../src/layer-transition';
import { CoastRaidRuntime } from '../src/raid-runtime/runtime';
import { createSessionState, SaveSession } from '../src/session';
import { decodeSession, RecoveryStore, SESSION_KEY, type SessionRecord } from '../src/recovery-store';
import { decodePortableBackup, encodeRecoveryBackup } from '../src/save-backup';

const NOW = 1800000000000;
const OLD_IDS = ['creature', 'elite', 'salt', 'scav'];
type Route = 'classic' | 'buildings' | 1 | 2 | 3;

function fixture(route?: Route, initial?: string) {
    const data = new Map<string, string>();
    if (initial !== undefined) data.set(SESSION_KEY, initial);
    let denied = false, writes = 0;
    const storage: D.StorageLike = {
        getItem: key => data.get(key) ?? null,
        setItem: (key, value) => { if (denied) throw Error('quota'); data.set(key, value); writes++; },
    };
    const state = createSessionState(), saves = new SaveSession(state, () => storage, undefined, () => NOW);
    assert.ok(saves.initialize(), state.storageError); state.state = 'hideout';
    if (route !== undefined) {
        assert.ok(saves.beginRun(42, route === 'classic' ? false : route === 'buildings' ? true : 'mall',
            typeof route === 'number' ? { mallLayout: route, legacyEnemies: true } : { legacyEnemies: true }));
        state.state = 'run';
    }
    return { data, storage, state, saves, deny: (value: boolean) => { denied = value; },
        get bytes() { return data.get(SESSION_KEY)!; }, get writes() { return writes; } };
}

function enemies(record: SessionRecord): EnemyState[] {
    const raid = record.expansion?.raid;
    return raid ? Object.values(raid.maps).flatMap(map => map.enemies).concat(raid.pursuits.map(p => p.enemy)) : record.raid!.enemies;
}
function identity(record: SessionRecord) {
    const raid = record.expansion?.raid ?? record.raid!;
    return { enemies: enemies(record), rng: raid.rng, nextEntity: raid.nextEntity,
        roster: record.expansion?.raid?.roster, pursuits: record.expansion?.raid?.pursuits };
}
function mark(enemy: EnemyState, i: number) {
    enemy.hp -= 1; enemy.rotation = .5;
    enemy.state = (['patrol', 'investigate', 'chase', 'attack', 'return'] as const)[i % 5];
    enemy.timer = 1.25; enemy.cooldown = .75; enemy.repath = .125; enemy.alert = 4.5;
    enemy.target = { x: enemy.x, y: enemy.y }; enemy.path = [{ ...enemy.target }];
}

for (const route of ['classic', 'buildings', 1, 2, 3] as const) {
    test(`enemy compatibility ${route}: live state survives quota retry, reload and portable import without ID or RNG changes`, () => {
        const f = fixture(route), runtime = new CoastRaidRuntime(f.state, f.saves);
        try {
            const original = f.saves.currentRecord()!;
            assert.deepEqual([...new Set(enemies(original).map(e => e.id))].sort(), OLD_IDS);
            runtime.enemies.forEach(mark);
            const live = f.saves.backupRecord()!, expected = structuredClone(identity(live));
            assert.notDeepEqual(expected.enemies, identity(original).enemies, 'the test must capture changed AI state');
            const bytes = f.bytes, revision = f.saves.revision, writes = f.writes;
            f.deny(true);
            assert.equal(f.saves.persist(), false);
            assert.equal(f.bytes, bytes); assert.equal(f.saves.revision, revision); assert.equal(f.writes, writes);
            assert.deepEqual(identity(f.saves.currentRecord()!), identity(original), 'failure cannot publish the candidate');
            assert.deepEqual(identity(f.saves.backupRecord()!), expected, 'live candidate remains available for export or retry');
            f.deny(false); assert.ok(f.saves.persist(), f.state.storageError);
            assert.equal(f.writes, writes + 1); assert.equal(f.saves.revision, revision + 1);
            assert.deepEqual(identity(decodeSession(f.bytes)), expected);

            const store = new RecoveryStore(f.storage, () => NOW); store.load();
            assert.deepEqual(identity(store.record!), expected);
            const reopened = fixture(undefined, f.bytes);
            reopened.state.state = 'menu'; assert.ok(reopened.saves.resumeRun()); reopened.state.state = 'run';
            const restored = new CoastRaidRuntime(reopened.state, reopened.saves);
            try { assert.deepEqual(identity(reopened.saves.backupRecord()!), expected); } finally { restored.cancelStart(); }

            const portable = decodePortableBackup(encodeRecoveryBackup(live));
            assert.equal(portable.kind, 'session'); if (portable.kind !== 'session') return;
            const target = fixture(); assert.ok(target.saves.importRecord(portable.record), target.state.storageError);
            assert.deepEqual(identity(decodeSession(target.bytes)), expected);
            target.state.state = 'menu'; assert.ok(target.saves.resumeRun()); target.state.state = 'run';
            const imported = new CoastRaidRuntime(target.state, target.saves);
            try { assert.deepEqual(identity(target.saves.backupRecord()!), expected); } finally { imported.cancelStart(); }
        } finally { runtime.cancelStart(); }
    });

    test(`enemy compatibility ${route}: unknown IDs cannot enter old records or overwrite corrupt source bytes`, () => {
        const source = fixture(route), valid = source.saves.currentRecord()!;
        assert.deepEqual(decodeSession(JSON.stringify(valid)), valid, 'the unchanged source must decode before testing a forged ID');
        assert.deepEqual(decodePortableBackup(encodeRecoveryBackup(valid)), { kind: 'session', record: valid });
        const rejection = { name: 'Error', message: route === 'classic'
            ? /行动检查点损坏或版本不兼容/ : /建筑、角色或基地存档损坏或版本不兼容/ };
        for (const id of [...ENEMY_CATALOG.map(e => e.id), 'future-enemy-prototype', '__proto__', 'constructor']) {
            const bad = structuredClone(valid), enemy = enemies(bad)[0]; enemy.id = id;
            const roster = bad.expansion?.raid?.roster.find(e => e.uid === enemy.uid);
            if (roster) roster.id = id; // Consistent forgery must still fail the allowed-prototype check.
            const raw = JSON.stringify(bad, null, 2) + '\n';
            assert.throws(() => decodeSession(raw), rejection, id);
            assert.throws(() => decodePortableBackup(JSON.stringify({ format: 'escape-bincov-recovery-backup', formatVersion: bad.version, record: bad })), rejection, id);
            const target = fixture(), bytes = target.bytes, writes = target.writes;
            assert.equal(target.saves.importRecord(bad), false); assert.equal(target.bytes, bytes); assert.equal(target.writes, writes);
            target.data.set(SESSION_KEY, raw);
            const store = new RecoveryStore(target.storage, () => NOW);
            assert.throws(() => store.load(), rejection, id); assert.equal(store.original(), raw);
            const state = createSessionState(), saves = new SaveSession(state, () => target.storage, undefined, () => NOW);
            assert.equal(saves.initialize(), false); assert.equal(saves.persist(), false);
            assert.equal(saves.original(), raw); assert.equal(target.bytes, raw); assert.equal(target.writes, writes);
        }
    });
}

test('enemy compatibility: real building pursuit has one persistent owner through failed transition retry and backup import', () => {
    const f = fixture('buildings'), entry = BUILDING_WORLD.maps.coast.entries.find(e => e.id === 'resident-up')!;
    const ready = f.saves.prepareExpansionMutation(draft => {
        const raid = draft.expansion.raid!, enemy = raid.maps.coast.enemies[0];
        raid.player = { ...entry.at, rotation: 0 };
        Object.assign(enemy, entry.at); enemy.home = { ...entry.at }; enemy.target = { ...entry.at };
        enemy.state = 'chase'; enemy.alert = 6;
    });
    assert.ok(ready); assert.equal(f.saves.commitExpansionMutation(ready), 'committed');
    const before = f.saves.currentRecord()!, bytes = f.bytes;
    const ticket = f.saves.prepareExpansionMutation(draft => changeLayer(draft.expansion, BUILDING_WORLD, entry.id));
    assert.ok(ticket); f.deny(true);
    assert.equal(f.saves.commitExpansionMutation(ticket), 'save-failed'); assert.equal(f.bytes, bytes);
    assert.deepEqual(identity(f.saves.currentRecord()!), identity(before));
    f.deny(false); assert.equal(f.saves.commitExpansionMutation(ticket), 'committed');
    assert.equal(f.saves.commitExpansionMutation(ticket), 'rejected');
    const record = f.saves.currentRecord()!, raid = record.expansion!.raid!, pursuit = raid.pursuits[0];
    assert.ok(pursuit); assert.equal(raid.maps.coast.enemies.some(e => e.uid === pursuit.enemy.uid), false);
    assert.equal(enemies(record).filter(e => e.uid === pursuit.enemy.uid).length, 1);
    assert.deepEqual(raid.roster, before.expansion!.raid!.roster);
    const portable = decodePortableBackup(encodeRecoveryBackup(record));
    assert.equal(portable.kind, 'session'); if (portable.kind !== 'session') return;
    const target = fixture(); assert.ok(target.saves.importRecord(portable.record));
    assert.deepEqual(identity(decodeSession(target.bytes)), identity(record));
    target.state.state = 'menu'; assert.ok(target.saves.resumeRun()); target.state.state = 'run';
    const runtime = new CoastRaidRuntime(target.state, target.saves);
    try { assert.deepEqual(identity(target.saves.backupRecord()!), identity(record)); } finally { runtime.cancelStart(); }

    for (const fault of ['unknown-pursuer', 'duplicate-owner', 'missing-roster', 'future-state'] as const) {
        const bad = structuredClone(record), r = bad.expansion!.raid!, e = r.pursuits[0].enemy;
        if (fault === 'unknown-pursuer') { e.id = 'future-enemy-prototype'; r.roster.find(item => item.uid === e.uid)!.id = e.id; }
        if (fault === 'duplicate-owner') r.maps.coast.enemies.push(structuredClone(e));
        if (fault === 'missing-roster') r.roster = r.roster.filter(item => item.uid !== e.uid);
        if (fault === 'future-state') Object.assign(e, { prototypeId: 'future-enemy-prototype' });
        assert.throws(() => decodeSession(JSON.stringify(bad)), { name: 'Error', message: /建筑、角色或基地存档损坏或版本不兼容/ }, fault);
    }
});
