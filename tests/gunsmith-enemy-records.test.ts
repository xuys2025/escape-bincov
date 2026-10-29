import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionState, SaveSession } from '../src/session';
import { decodeSession, enemyRecord, RecoveryStore, SESSION_KEY, type SessionRecord } from '../src/recovery-store';
import { decodePortableBackup, encodeRecoveryBackup } from '../src/save-backup';
import { RealHideoutRuntime } from '../src/hideout-runtime';
import { oldRecord, makeV4 } from './fixtures/old-saves';

// Record v8 and the enemy rules of #81 (docs/gunsmith/CONTRACTS.md, the save and migration section). Main took records
// 6 and 7 for "enemy rules on" before gun instances landed, so the gun format is v8, one number whatever else a record
// carries. Perk rules stay keyed by the expansion version; enemy rules are on exactly while the record holds
// `enemyBackup`. These tests prove a v6/v7 record keeps them through migration and later raids, a v4/v5 record gets them
// only from its first enemy raid, and a v8 record that breaks the rule is refused with its bytes kept.
const NOW = 1800000000000;
function page(raw?: string) {
    const data = new Map<string, string>(raw ? [[SESSION_KEY, raw]] : []);
    let full = false;
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { if (full) throw Error('quota'); data.set(k, v); } };
    const state = createSessionState(), saves = new SaveSession(state, () => storage, undefined, () => NOW);
    const initialized = saves.initialize(); state.state = state.save.activeRun ? 'menu' : 'hideout';
    return { data, storage, state, saves, initialized, fail: (value: boolean) => { full = value; },
        get raw() { return data.get(SESSION_KEY)!; }, get record() { return decodeSession(data.get(SESSION_KEY)!); } };
}
type Page = ReturnType<typeof page>;
/** Resume the live raid from the menu, as after a reload, and settle it by extraction. */
function settle(p: Page) {
    p.state.state = 'menu'; assert.ok(p.saves.resumeRun()); p.state.state = 'run';
    assert.ok(p.saves.prepareSettlement('extract', 0)); assert.ok(p.saves.retrySettlement()); p.state.state = 'hideout';
}
/** A new save that deployed one raid: a street raid with the enemy system (raid v5), or without it (raid v3). */
function deployed(enemies: boolean) {
    const p = page(); assert.ok(p.initialized); assert.ok(p.saves.enableRpg());
    assert.ok(p.saves.beginRun(42, true, { legacyEnemies: !enemies }));
    assert.equal(p.record.expansion!.raid!.version, enemies ? 5 : 3);
    return p.record;
}
const backups = (r: SessionRecord) => [r.legacyBackup, r.migrationBackup, r.systemsBackup, r.perksBackup, r.enemyBackup];

test('v6 and v7 records keep enemy rules through migration, settlement and later raids', () => {
    // The records main 67a7468 stores for a live combined raid (7) and for an enemy-only raid of a v2 expansion (6).
    const v7 = oldRecord(deployed(true)), v6 = structuredClone(v7);
    v6.version = 6; delete v6.perksBackup; v6.expansion.version = 2; delete v6.expansion.growth.perks; v6.expansion.raid.version = 4;
    assert.equal(v7.version, 7); assert.equal(typeof v7.enemyBackup, 'string');
    for (const old of [v7, v6]) {
        const text = JSON.stringify(old), name = `record ${old.version}`, p = page(text);
        // Opening writes v8: the old text becomes gunsBackup; every earlier backup, enemyBackup included, stays as it was.
        assert.ok(p.initialized, name);
        const r = p.record;
        assert.deepEqual([r.version, r.gunsBackup, r.expansion!.raid!.version], [9, text, old.expansion.raid.version], name);
        assert.deepEqual(backups(r), [old.legacyBackup, old.migrationBackup, old.systemsBackup, old.perksBackup, old.enemyBackup], name);
        assert.ok(enemyRecord(r), name);
        // Sticky: settling, the station boundary (perks for the v6 one) and a later raid without enemies keep them on.
        settle(p);
        const settled = p.raw; assert.equal(p.record.expansion!.raid, null); assert.equal(p.record.enemyBackup, old.enemyBackup, name);
        assert.ok(p.saves.ensureRpg(), name);
        assert.equal(p.record.expansion!.version, 3, name);
        assert.equal(p.record.perksBackup, old.version === 6 ? settled : old.perksBackup, `${name}: perksBackup keyed by the expansion`);
        assert.ok(p.saves.beginRun(43, 'mall'), name); assert.equal(p.record.expansion!.raid!.version, 3, name);
        assert.equal(p.record.enemyBackup, old.enemyBackup, name); assert.equal(p.record.gunsBackup, text, name);
        const reopened = page(p.raw); assert.deepEqual(backups(reopened.record), backups(p.record), name);
    }
});

test('v4 and v5 records have no enemy rules until their first enemy raid, which keeps the exact bytes before it once', () => {
    const v5 = oldRecord(deployed(false)), v4 = structuredClone(v5);
    makeV4(v4);
    assert.deepEqual([v5.version, v4.version, 'enemyBackup' in v5, 'enemyBackup' in v4], [5, 4, false, false]);
    for (const old of [v5, v4]) {
        const text = JSON.stringify(old), name = `record ${old.version}`, p = page(text);
        assert.ok(p.initialized, name);
        assert.deepEqual([p.record.version, p.record.gunsBackup, enemyRecord(p.record)], [9, text, false], name);
        assert.equal(Object.hasOwn(JSON.parse(p.raw), 'enemyBackup'), false, `${name}: no key, not even null`);
        assert.ok(p.saves.persist(), name); assert.equal(enemyRecord(p.record), false, name);
        settle(p); assert.equal(enemyRecord(p.record), false, name);
        assert.ok(p.saves.ensureRpg(), name);
        // The first street raid turns them on in its own deployment write; a failed write turns nothing on.
        const before = p.raw;
        p.fail(true); assert.equal(p.saves.beginRun(44, true), false, name); assert.equal(p.raw, before, name);
        p.fail(false); assert.ok(p.saves.beginRun(44, true), name);
        const on = p.record;
        assert.deepEqual([on.version, on.expansion!.raid!.version, on.enemyBackup, on.gunsBackup], [9, 5, before, text], name);
        settle(p); assert.equal(p.record.enemyBackup, before, `${name}: retained once, never replaced`);
    }
});

test('a v8 record breaking the enemy rule is refused, never repaired, and its bytes stay', () => {
    const live = deployed(true), bare = decodeSession(page().raw), settledOn = (() => { const p = page(JSON.stringify(oldRecord(live))); settle(p); return p.record; })();
    assert.equal(bare.expansion, undefined); assert.ok(enemyRecord(settledOn));
    const faults: [string, SessionRecord, (r: any) => void][] = [
        ['a live enemy raid without enemyBackup', live, r => { delete r.enemyBackup; }],
        ['enemyBackup that is not text or null', live, r => { r.enemyBackup = 5; }],
        ['enemyBackup without an expansion', bare, r => { r.enemyBackup = null; }],
        ['a v8 record labelled 7', live, r => { r.version = 7; }],
        ['a v8 record labelled 6 without perks', live, r => { r.version = 6; delete r.perksBackup; }],
    ];
    for (const [why, base, mutate] of faults) {
        const r = structuredClone(base) as any; mutate(r); const raw = JSON.stringify(r);
        assert.throws(() => decodeSession(raw), /无法读取这份存档/, why);
        const p = page(raw); assert.equal(p.initialized, false, why); assert.equal(p.raw, raw, why);
        assert.throws(() => new RecoveryStore(p.storage).load(), why); assert.equal(p.data.get(SESSION_KEY), raw, why);
    }
    // The flag alone, with no live raid, is the ordinary state after the first enemy raid; null is a valid value.
    assert.doesNotThrow(() => decodeSession(JSON.stringify(settledOn)));
    assert.doesNotThrow(() => decodeSession(JSON.stringify({ ...settledOn, enemyBackup: null })));
});

test('imports follow main\'s rule: a fresh origin keeps the imported enemy rules, a current perk origin keeps its own', () => {
    // An old v7 backup file into a new save: enemy rules arrive with it, its enemyBackup and gunsBackup (its own text) kept.
    const v7 = oldRecord(deployed(true)), file = JSON.stringify({ format: 'escape-bincov-recovery-backup', formatVersion: 7, record: v7 });
    const decoded = decodePortableBackup(file); assert.equal(decoded.kind, 'session'); if (decoded.kind !== 'session') return;
    assert.deepEqual([decoded.record.version, decoded.record.enemyBackup, decoded.record.gunsBackup], [9, v7.enemyBackup, JSON.stringify(v7)]);
    const fresh = page(); assert.ok(fresh.saves.importRecord(decoded.record));
    assert.deepEqual([fresh.record.version, fresh.record.enemyBackup, fresh.record.gunsBackup], [9, v7.enemyBackup, JSON.stringify(v7)]);
    // A perk save without enemy rules imported into a perk origin with them: the origin keeps its own copies, rules on.
    const v5 = oldRecord(deployed(false)); settleText(v5);
    const plain = decodePortableBackup(JSON.stringify({ format: 'escape-bincov-recovery-backup', formatVersion: 5, record: v5 }));
    assert.equal(plain.kind, 'session'); if (plain.kind !== 'session') return;
    assert.equal(enemyRecord(plain.record), false);
    const own = fresh.record; settle(fresh);
    assert.ok(fresh.saves.importRecord(plain.record));
    assert.deepEqual([fresh.record.enemyBackup, fresh.record.perksBackup, fresh.record.gunsBackup], [own.enemyBackup, own.perksBackup, own.gunsBackup]);
    assert.notEqual(plain.record.gunsBackup, own.gunsBackup);
    // Its export is a v8 file; the round trip keeps the flag and every backup.
    const again = decodePortableBackup(encodeRecoveryBackup(fresh.record)); assert.equal(again.kind, 'session'); if (again.kind !== 'session') return;
    assert.deepEqual(backups(again.record), backups(fresh.record)); assert.equal(JSON.parse(encodeRecoveryBackup(fresh.record)).formatVersion, 9);
});

test('gunsBackup on import follows the same rule: a fresh origin keeps the backup\'s own, a current perk origin keeps its own', () => {
    const envelope = (record: any) => JSON.stringify({ format: 'escape-bincov-recovery-backup', formatVersion: record.version, record });
    const read = (text: string): SessionRecord => { const d = decodePortableBackup(text); assert.equal(d.kind, 'session'); return (d as { record: SessionRecord }).record; };
    const copies = (r: SessionRecord) => [r.gunsBackup, r.perksBackup, r.enemyBackup];
    const settled = (enemies: boolean) => { const r = oldRecord(deployed(enemies)); settleText(r); return r; };
    // Old backup files (settled records 3, 5 and 7): read as v8, each with its own record text as gunsBackup.
    const olds = [oldRecord(page().record), settled(false), settled(true)].map(r => ({ name: `old record ${r.version}`, own: JSON.stringify(r), file: envelope(r) }));
    // A v8 backup file of a save that was migrated itself: it carries that save's gunsBackup (its v5 text) and perksBackup.
    const migrated = settled(false), source = page(JSON.stringify(migrated)); assert.ok(source.initialized);
    const backups = [...olds, { name: 'v8', own: JSON.stringify(migrated), file: encodeRecoveryBackup(source.record) }].map(b => ({ ...b, record: read(b.file) }));
    assert.deepEqual(backups.map(b => [b.record.version, b.record.gunsBackup]), backups.map(b => [9, b.own]));
    assert.deepEqual(backups.map(b => JSON.parse(b.file).formatVersion), [3, 5, 7, 9]);
    // A fresh origin (a new game, no perk profile) keeps every backup's own copies, gunsBackup included, and reads them back.
    for (const b of backups) {
        const fresh = page(); assert.equal(fresh.record.gunsBackup, null);
        assert.ok(fresh.saves.importRecord(b.record), b.name);
        assert.deepEqual(copies(fresh.record), copies(b.record), b.name); assert.equal(fresh.record.gunsBackup, b.own, b.name);
        assert.deepEqual(copies(page(fresh.raw).record), copies(b.record), `${b.name}: read back`);
    }
    // The rule is the perk profile's, as for perksBackup and enemyBackup: an origin without one takes the imported copy even
    // when it holds a gunsBackup of its own (opened from an old record 3).
    const plain = page(JSON.stringify(oldRecord(page().record)));
    assert.deepEqual([typeof plain.record.gunsBackup, plain.record.expansion], ['string', undefined]);
    assert.ok(plain.saves.importRecord(backups[3].record)); assert.deepEqual(copies(plain.record), copies(backups[3].record));
    // An existing perk origin (opened from its own settled record 7: gunsBackup, perksBackup and enemyBackup of its own) keeps
    // all three when a backup with a perk profile replaces its save, by the old tab page or by the yard.
    const existing = () => { const mine = settled(true), p = page(JSON.stringify(mine)); assert.equal(p.record.gunsBackup, JSON.stringify(mine)); return p; };
    for (const b of backups.slice(1)) for (const yard of [false, true]) {
        const p = existing(), own = copies(p.record), name = `${b.name} by the ${yard ? 'yard' : 'tab page'}`;
        if (yard) {
            const rt = new RealHideoutRuntime(p.state, p.saves, () => NOW); assert.ok(rt.enter().ok, name);
            const preview = rt.previewImport(b.file); assert.ok(preview.ok && preview.token, name); assert.ok(rt.importBackup(b.file, preview.token!).ok, name);
        } else assert.ok(p.saves.importRecord(b.record), name);
        assert.deepEqual(p.record.profile, b.record.profile, `${name}: the save is the backup's`);
        assert.deepEqual(copies(p.record), own, name); assert.notEqual(own[0], b.own, name);
    }
    // A backup without an expansion cannot replace it at all; the bytes stay.
    const locked = existing(), bytes = locked.raw; assert.equal(locked.saves.importRecord(backups[0].record), false); assert.equal(locked.raw, bytes);
    // A confirmed older expansion starts a new cycle there: a v4 backup with a live v2 raid brings its own gunsBackup and no
    // perk or enemy copy; settling and the next station boundary then keep the perk upgrade's text, never a second gunsBackup.
    const live = oldRecord(deployed(false)); makeV4(live);
    const older = read(envelope(live)), p = existing();
    assert.ok(p.saves.importRecord(older)); assert.deepEqual(copies(p.record), [JSON.stringify(live), undefined, undefined]);
    settle(p); const before = p.raw; assert.ok(p.saves.ensureRpg());
    assert.deepEqual(copies(p.record), [JSON.stringify(live), before, undefined]);
});

/** In place: the settled form of an old live-raid record, as its client would have written after extraction. */
function settleText(old: any) {
    const p = page(JSON.stringify(old)); settle(p);
    Object.assign(old, oldRecord(p.record, old.version));
    for (const key of Object.keys(old)) if (!(key in oldRecord(p.record, old.version))) delete old[key];
}
