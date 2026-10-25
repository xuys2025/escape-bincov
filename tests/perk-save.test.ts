import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import type { BulletState } from '../src/checkpoint';
import { SaveSession, createSessionState, type ExpansionDraft } from '../src/session';
import { RecoveryStore, SESSION_KEY, decodeSession, type SessionRecord } from '../src/recovery-store';
import { decodePortableBackup, encodeRecoveryBackup } from '../src/save-backup';
import { RealHideoutRuntime, type Result } from '../src/hideout-runtime';
import { derivedLimits, newExpansion, upgradeToRpg, validateExpansion, type ExpansionState } from '../src/expansion-state';
import { resolveExpansionWorld } from '../src/expansion-worlds';
import { resolveLayerShot } from '../src/layer-transition';
import { isPristine, startOver } from '../src/fresh-start';
import type { CritSnapshot, PerkId } from '../src/perks';
import { plainCrit } from './fixtures/layered';
import { makeV4 } from './fixtures/old-saves';
import { actorArchetype } from '../src/enemy-archetypes';

// Save format of the perk work (#77, docs/tasks/critical-perk-contract.md sections 1, 2 and 6): expansion v3 and raid
// v3, the station-boundary upgrade, and the CP-08/CP-22/CP-23 fixtures. Since the gun instance format (gunsmith M1-02)
// every write is session v8 and the expansion names its own version; the previous client's v4 records are read and
// migrated on load, keeping their expansion and raid versions (v2) until the station boundary.
const NOW = 1800000000000;
function origin() {
    const data = new Map<string, string>(), failing = new Set<string>();
    const storage: D.StorageLike = { getItem: k => data.get(k) ?? null, setItem: (k, v) => { if (failing.has(k)) throw new Error('quota'); data.set(k, v); } };
    return { data, failing, storage };
}
type Origin = ReturnType<typeof origin>;
/** One page on the origin: SaveSession and the yard Runtime; `enter` walks into the station (the upgrade boundary). */
function page(o: Origin = origin(), enter = true) {
    const clock = { now: NOW }, state = createSessionState(), saves = new SaveSession(state, () => o.storage, undefined, () => clock.now);
    const initialized = saves.initialize();
    const runtime = new RealHideoutRuntime(state, saves, () => clock.now);
    if (enter) assert.ok(runtime.enter().ok);
    const setup = (action: (draft: ExpansionDraft) => void) => {
        const ticket = saves.prepareExpansionMutation(action); assert.ok(ticket); assert.equal(saves.commitExpansionMutation(ticket), 'committed');
    };
    return { o, clock, state, saves, runtime, setup, initialized,
        get raw() { return o.data.get(SESSION_KEY)!; }, get record() { return decodeSession(o.data.get(SESSION_KEY)!); } };
}
type Page = ReturnType<typeof page>;
function reason(result: Result) { assert.equal(result.ok, false); return !result.ok && result.reason; }
/** The record the previous client (session v4) writes for the same state: expansion and raid v2, no perks, no gun fields. */
function asV4(text: string): string {
    const r = JSON.parse(text); assert.equal(r.version, 8); assert.deepEqual(r.expansion.growth.perks, []);
    makeV4(r);
    return JSON.stringify(r);
}
const envelope = (text: string) => JSON.stringify({ format: 'escape-bincov-recovery-backup', formatVersion: JSON.parse(text).version, record: JSON.parse(text) });
function importText(p: Page, text: string) { const preview = p.runtime.previewImport(text); assert.ok(preview.ok && preview.token); return p.runtime.importBackup(text, preview.token!); }
/** An RNG state whose next draw is below 2%: a critical hit under the old v2 rule at any closeness and technique. */
function lowDraw() { let s = 1; while (D.seededRandom(s)() >= .02) s++; return s; }
/** An RNG state whose next draw falls in [lo, hi). */
function drawIn(lo: number, hi: number) { let s = 1; while (!(D.seededRandom(s)() >= lo && D.seededRandom(s)() < hi)) s++; return s; }
/** A player round fired at point blank into a live enemy of the current layer, with its shot snapshot in a v3 raid; never lethal. */
function fire(state: ExpansionState, crit?: CritSnapshot) {
    // This probe isolates crit migration: authored encounters may put an armoured role first.
    const raid = state.raid!, world = resolveExpansionWorld(raid.worldVersion)!, enemy = raid.maps[raid.currentMap].enemies.find(e => e.hp > 20 && !actorArchetype(e)?.armor)!;
    const bullet: BulletState = { uid: 'probe', x: enemy.x, y: enemy.y, rotation: 0, vx: 900, vy: 0, left: 40, damage: 10, enemy: false, ...(crit ? { crit } : {}) };
    const hp = enemy.hp, rng = raid.rng;
    let critical: boolean | null = null;
    assert.ok(resolveLayerShot(state, world, raid.currentMap, bullet, true, (_uid, value) => { critical = value; }));
    return { critical, damage: hp - enemy.hp, rolled: raid.rng !== rng };
}

test('CP-22: a v4 live v2 raid keeps old rules and expansion v2 until settlement; the station upgrades it and the next street raid combines both systems', () => {
    const o = origin(), first = page(o);
    assert.ok(first.runtime.deploy({ world: 'mall', seed: 'cp-22' }).ok); assert.equal(first.record.expansion!.raid!.version, 3);
    const old = asV4(first.raw); o.data.set(SESSION_KEY, old); // what the previous client stored for this deployment
    const p = page(o, false);
    // Read and written as v8 (the gun format), the v4 text kept as gunsBackup; the expansion and raid stay v2.
    assert.equal(p.initialized, true); assert.equal(p.record.version, 8); assert.equal(p.record.gunsBackup, old);
    assert.equal(p.state.expansion!.version, 2); assert.equal(p.state.expansion!.raid!.version, 2);
    // The station boundary stays closed while the raid is live: no upgrade and no write.
    const live = p.raw; assert.equal(reason(p.runtime.enter()), 'locked'); assert.equal(p.saves.ensureRpg(), false); assert.equal(p.raw, live);
    assert.ok(p.saves.resumeRun()); p.state.state = 'run';
    // The old centre-closeness rule rolls once on each hit: at point blank (10% at technique 10) a low draw and a draw
    // between 7% and 10% are both critical hits (x1.5).
    const low = lowDraw();
    let hit: ReturnType<typeof fire> | null = null;
    p.setup(d => { d.expansion.raid!.rng = low; hit = fire(d.expansion); });
    assert.deepEqual(hit, { critical: true, damage: 15, rolled: true });
    p.setup(d => { d.expansion.raid!.rng = drawIn(.07, .1); hit = fire(d.expansion); });
    assert.deepEqual(hit, { critical: true, damage: 15, rolled: true });
    assert.equal(p.record.expansion!.version, 2); assert.equal(p.record.expansion!.raid!.version, 2);
    // A v2 raid's rounds carry no shot snapshot: such a field is rejected, not ignored.
    const withRound = (extra: object) => {
        const r = JSON.parse(p.raw), raid = r.expansion.raid;
        raid.maps[raid.currentMap].bullets.push({ uid: `entity-${raid.runId}-${raid.nextEntity++}`, x: raid.player.x, y: raid.player.y, rotation: 0,
            vx: 100, vy: 0, left: 50, damage: 10, enemy: false, ...extra });
        return JSON.stringify(r);
    };
    assert.doesNotThrow(() => decodeSession(withRound({})));
    assert.throws(() => decodeSession(withRound({ crit: { sources: [{ id: 'weapon', chance: .05 }], multiplier: 1.5, target: null } })));
    // Settling still keeps expansion v2; the next station boundary upgrades and keeps that exact text once.
    assert.ok(p.saves.prepareSettlement('extract', 0)); assert.ok(p.saves.retrySettlement());
    const settled = p.raw; assert.equal(p.record.expansion!.version, 2); assert.equal(p.record.expansion!.raid, null);
    p.state.state = 'result'; assert.ok(p.runtime.returnToBase().ok);
    const upgraded = p.record;
    assert.equal(upgraded.version, 8); assert.equal(upgraded.perksBackup, settled); assert.equal(upgraded.gunsBackup, old);
    assert.equal(upgraded.expansion!.version, 3); assert.deepEqual(upgraded.expansion!.growth.perks, []);
    // The next deployment is v3: a round rolls its shot snapshot once (a pistol at technique 10: 6.9%), never the old
    // formula, which gives 10% at point blank; a draw between the two crits only under the old rule.
    assert.ok(p.runtime.deploy({ world: 'buildings', seed: 'cp-22-next' }).ok);
    const next = structuredClone(p.state.expansion!); assert.equal(next.raid!.version, 5); assert.equal(p.record.perksBackup, settled);
    next.raid!.rng = drawIn(.07, .1); assert.deepEqual(fire(next, plainCrit()), { critical: false, damage: 10, rolled: true });
    next.raid!.rng = low; assert.deepEqual(fire(next, plainCrit()), { critical: true, damage: 15, rolled: true });
});

test('CP-22: a classic checkpoint raid in a v4 record also keeps expansion v2 until it settles', () => {
    const o = origin(), first = page(o);
    assert.ok(first.runtime.deploy({ world: 'coast', seed: 'cp-22-coast' }).ok);
    assert.notEqual(first.record.raid, null); assert.equal(first.record.expansion!.raid, null);
    o.data.set(SESSION_KEY, asV4(first.raw));
    const p = page(o, false); assert.equal(p.record.expansion!.version, 2); assert.equal(p.saves.ensureRpg(), false);
    assert.ok(p.saves.resumeRun()); p.state.state = 'run';
    assert.ok(p.saves.persist()); assert.equal(p.record.expansion!.version, 2);
    assert.ok(p.saves.prepareSettlement('death', 0)); assert.ok(p.saves.retrySettlement());
    const settled = p.raw; assert.equal(p.record.expansion!.version, 2);
    p.state.state = 'result'; assert.ok(p.runtime.returnToBase().ok);
    assert.equal(p.record.expansion!.version, 3); assert.equal(p.record.perksBackup, settled);
});

test('perk format round trips: new game, settled and live backups, reopen', () => {
    // A new game writes a record without an expansion first; the first station entry writes expansion v3 directly, so
    // there is no v1/v2 expansion to keep.
    const o = origin(), a = page(o, false), v3 = a.raw; assert.equal(JSON.parse(v3).version, 8); assert.equal('expansion' in JSON.parse(v3), false);
    assert.ok(a.runtime.enter().ok);
    assert.equal(a.record.version, 8); assert.equal(a.record.expansion!.version, 3); assert.equal(a.record.systemsBackup, v3); assert.equal(a.record.perksBackup, null);
    const perks: PerkId[] = ['strength-20-b', 'constitution-15-a', 'technique-15-a', 'technique-30-b'];
    a.setup(d => { d.expansion.growth.permanent = { strength: 25, constitution: 15, technique: 30 }; d.expansion.growth.perks = [...perks]; });
    const growth = structuredClone(a.state.expansion!.growth);
    // Settled export and import into another save.
    const settled = a.runtime.exportBackup(), file = JSON.parse(settled);
    assert.equal(file.formatVersion, 8); assert.equal(file.record.version, 8); assert.deepEqual(file.record.expansion.growth.perks, perks);
    const b = page(); assert.ok(importText(b, settled).ok);
    assert.equal(b.record.version, 8); assert.deepEqual(b.state.expansion!.growth, growth);
    assert.equal(b.record.perksBackup, null, 'the importing save keeps its own recovery bytes');
    // Live export: the v3 raid travels with the perks and resumes as v3.
    assert.ok(a.runtime.deploy({ world: 'mall', seed: 'round-trip' }).ok);
    const live = a.runtime.exportBackup(), decoded = decodePortableBackup(live);
    assert.equal(decoded.kind, 'session'); if (decoded.kind !== 'session') return;
    assert.equal(decoded.record.version, 8); assert.equal(decoded.record.expansion!.raid!.version, 3);
    assert.equal(encodeRecoveryBackup(decoded.record), JSON.stringify({ format: 'escape-bincov-recovery-backup', formatVersion: 8, record: decoded.record }));
    const c = page(); assert.ok(importText(c, live).ok);
    assert.equal(c.state.state, 'menu'); assert.equal(c.record.version, 8); assert.equal(c.state.expansion!.raid!.version, 3);
    assert.deepEqual(c.state.expansion!.growth, growth); assert.ok(c.saves.resumeRun());
    // An envelope must name its record's version.
    const mislabelled = JSON.parse(live); mislabelled.formatVersion = 4;
    assert.throws(() => decodePortableBackup(JSON.stringify(mislabelled)));
    // Reopen: the same record and recovery bytes.
    const before = a.record, reopened = page(o, false);
    assert.deepEqual(reopened.state.expansion!.growth, growth); assert.equal(reopened.state.expansion!.raid!.version, 3);
    assert.equal(reopened.record.perksBackup, before.perksBackup); assert.equal(reopened.record.systemsBackup, v3);
});

test('perksBackup holds the exact expansion-v2 text once: later writes, reopening and a fresh start keep it, never a v3 one', () => {
    const o = origin(), seed = page(o), old = asV4(seed.raw); o.data.set(SESSION_KEY, old);
    // Loading writes the record as v8 at once (still expansion v2): that text is what the perk upgrade replaces.
    const p = page(o, false), v4 = p.raw; assert.equal(p.record.expansion!.version, 2); assert.equal(p.record.gunsBackup, old);
    assert.ok(p.runtime.enter().ok); assert.equal(p.record.expansion!.version, 3); assert.equal(p.record.perksBackup, v4);
    p.setup(d => { d.expansion.growth.permanent.technique = 20; d.expansion.growth.perks = ['technique-20-a']; });
    assert.ok(p.saves.setVolume(.4)); assert.equal(p.record.perksBackup, v4);
    const kept = JSON.parse(p.record.perksBackup!); assert.equal(kept.expansion.version, 2); assert.equal('perksBackup' in kept, false);
    const reopened = page(o); assert.equal(reopened.record.perksBackup, v4); assert.equal(reopened.record.gunsBackup, old);
    // The fresh start is an import of a v3 expansion: perks reset to none, the recovery bytes stay.
    const systems = reopened.record.systemsBackup;
    assert.deepEqual(startOver(reopened.runtime, () => o.storage, reopened.clock.now), { ok: true, copied: true });
    const fresh = reopened.record;
    assert.equal(fresh.version, 8); assert.deepEqual(fresh.expansion!.growth.perks, []); assert.ok(isPristine(fresh));
    assert.equal(fresh.perksBackup, v4); assert.equal(fresh.systemsBackup, systems); assert.equal(fresh.gunsBackup, old);
});

test('CP-23: invalid perk selections and mismatched versions are rejected, never repaired; stored bytes and the current save stay', () => {
    const o = origin(), a = page(o);
    a.setup(d => {
        d.expansion.growth.permanent = { strength: 25, constitution: 20, technique: 30 };
        d.expansion.growth.perks = ['strength-15-a', 'strength-25-b', 'constitution-20-a', 'technique-15-a', 'technique-30-b'];
    });
    const valid = a.raw; assert.doesNotThrow(() => decodeSession(valid));
    const faults: [string, (r: any) => void][] = [
        ['unknown id', r => { r.expansion.growth.perks = ['strength-15-c']; }],
        ['prototype name', r => { r.expansion.growth.perks = ['toString']; }],
        ['repeated', r => { r.expansion.growth.perks = ['strength-15-a', 'strength-15-a']; }],
        ['out of catalog order', r => { r.expansion.growth.perks = ['strength-25-b', 'strength-15-a']; }],
        ['both sides of a node', r => { r.expansion.growth.perks = ['strength-15-a', 'strength-15-b']; }],
        ['above the permanent level', r => { r.expansion.growth.perks = ['strength-30-a']; }],
        ['reached only with a dose', r => { r.expansion.growth.permanent.strength = 14; r.expansion.body.effects.strength = 180; r.expansion.growth.perks = ['strength-15-a']; }],
        ['NaN entry', r => { r.expansion.growth.perks = [NaN]; }],
        ['not a list', r => { r.expansion.growth.perks = 'strength-15-a'; }],
        ['missing in v3', r => { delete r.expansion.growth.perks; }],
        ['perksBackup beside a v2 expansion', r => { r.expansion.version = 2; delete r.expansion.growth.perks; }],
        ['an old v4 record holding a v3 expansion', r => { makeV4(r); r.expansion.version = 3; r.expansion.growth.perks = []; }],
        ['an old v5 record holding a v2 expansion', r => { makeV4(r); r.version = 5; r.perksBackup = null; }],
        ['perks in a v2 expansion', r => { delete r.perksBackup; r.expansion.version = 2; }],
        ['a v3 expansion without perksBackup', r => { delete r.perksBackup; }],
        ['perksBackup not text', r => { r.perksBackup = 4; }],
        ['unknown record version', r => { r.version = 7; }],
    ];
    assert.ok(a.runtime.deploy({ world: 'buildings', seed: 'cp-23' }).ok);
    const deployed = a.raw; assert.doesNotThrow(() => decodeSession(deployed));
    const raidFaults: [string, (r: any) => void][] = [
        ['v2 raid in a v3 expansion', r => { r.expansion.raid.version = 2; }],
        ['v1 raid in a v3 expansion', r => { r.expansion.raid.version = 1; delete r.expansion.raid.shockAt; delete r.expansion.raid.mapEvent; }],
        ['v3 raid in a v2 expansion', r => { delete r.perksBackup; r.expansion.version = 2; delete r.expansion.growth.perks; }],
        ['v3 raid without the RPG keys', r => { delete r.expansion.raid.shockAt; }],
    ];
    const target = page(), kept = target.raw;
    for (const [why, mutate, base] of [...faults.map(f => [...f, valid] as const), ...raidFaults.map(f => [...f, deployed] as const)]) {
        const record = JSON.parse(base); mutate(record); const corrupt = JSON.stringify(record);
        assert.throws(() => decodeSession(corrupt), why);
        // As the stored record: refused, never treated as missing, and the original bytes stay.
        o.data.set(SESSION_KEY, corrupt);
        assert.throws(() => new RecoveryStore(o.storage).load(), why);
        const reload = page(o, false);
        assert.equal(reload.initialized, false, why); assert.equal(reload.state.storageOK, false, why); assert.equal(o.data.get(SESSION_KEY), corrupt, why);
        // As a backup file: the preview refuses it and the current save is untouched.
        assert.throws(() => decodePortableBackup(envelope(corrupt)), why);
        assert.equal(reason(target.runtime.previewImport(envelope(corrupt))), 'rule', why); assert.equal(target.raw, kept, why);
    }
});

test('CP-23: a quota failure on the first perk-format write keeps expansion v2; the retry upgrades once', () => {
    const o = origin(), seed = page(o); o.data.set(SESSION_KEY, asV4(seed.raw));
    const p = page(o, false), loaded = p.raw; assert.equal(p.record.expansion!.version, 2);
    o.failing.add(SESSION_KEY);
    assert.equal(reason(p.runtime.enter()), 'storage');
    assert.equal(p.raw, loaded); assert.equal(p.state.expansion!.version, 2, 'an unwritten upgrade is not published');
    o.failing.delete(SESSION_KEY);
    assert.ok(p.runtime.retrySave().ok); const v4 = p.raw; assert.equal(p.record.expansion!.version, 2, 'a retried checkpoint is not the upgrade');
    assert.ok(p.runtime.enter().ok); assert.equal(p.record.expansion!.version, 3); assert.equal(p.record.perksBackup, v4);
    const revision = p.saves.revision; assert.ok(p.runtime.enter().ok); assert.equal(p.saves.revision, revision, 'the upgrade is idempotent');
});

test('CP-23: a stale window cannot overwrite the upgraded record; an ordinary commit cannot write expansion v3 back as v2', () => {
    const o = origin(), seed = page(o); o.data.set(SESSION_KEY, asV4(seed.raw));
    const a = page(o, false), b = page(o, false); // b loaded last: a holds stale bytes
    assert.ok(b.runtime.enter().ok); const upgraded = b.raw; assert.equal(b.record.expansion!.version, 3);
    assert.equal(reason(a.runtime.enter()), 'conflict'); assert.equal(a.state.conflict, true); assert.equal(o.data.get(SESSION_KEY), upgraded);
    assert.equal(a.saves.setVolume(.1), false); assert.equal(o.data.get(SESSION_KEY), upgraded);
    assert.equal(new RecoveryStore(o.storage).load().expansion!.version, 3, 'a reload reads expansion v3');
    // Directly on the store: neither an older expansion nor none at all is written over a v3 one by an ordinary commit.
    const store = new RecoveryStore(o.storage, () => NOW), loaded = store.load(), older = structuredClone(loaded.expansion!);
    older.version = 2; delete older.growth.perks;
    assert.throws(() => store.commit(loaded.save, null, undefined, older)); assert.equal(o.data.get(SESSION_KEY), upgraded);
    assert.throws(() => store.commit(loaded.save, null, undefined, null)); assert.equal(o.data.get(SESSION_KEY), upgraded);
    // A confirmed import may write expansion v2; the next v3 write then keeps that text, as a new cycle.
    const imported = store.commit(loaded.save, null, undefined, older, true);
    assert.equal(imported.version, 8); assert.equal(imported.expansion!.version, 2); assert.equal('perksBackup' in imported, false);
    const v4 = o.data.get(SESSION_KEY)!, again = store.commit(loaded.save, null, undefined, loaded.expansion);
    assert.equal(again.version, 8); assert.equal(again.expansion!.version, 3); assert.equal(again.perksBackup, v4);
});

test('imports: a settled v4 backup upgrades at the station; one with a live v2 raid keeps expansion v2 until it settles', () => {
    const source = page(); source.setup(d => { d.profile.cash = 4321; d.expansion.growth.permanent.technique = 22; });
    const settled = envelope(asV4(source.raw));
    // The yard import is a station boundary: written with expansion v3 at once, the store's own recovery bytes kept
    // (the backup's own gunsBackup is dropped, as its perksBackup).
    const yard = page(); yard.setup(d => { d.expansion.growth.permanent.strength = 15; d.expansion.growth.perks = ['strength-15-a']; });
    const backup = yard.record.perksBackup, guns = yard.record.gunsBackup;
    assert.ok(importText(yard, settled).ok);
    assert.equal(yard.record.version, 8); assert.equal(yard.record.expansion!.version, 3); assert.equal(yard.record.perksBackup, backup);
    assert.equal(yard.record.gunsBackup, guns);
    assert.equal(yard.state.save.cash, 4321); assert.equal(yard.state.expansion!.growth.permanent.technique, 22); assert.deepEqual(yard.state.expansion!.growth.perks, []);
    // The old tab page writes the confirmed record as it is (expansion v2); its next station entry upgrades it.
    const tabs = page(), decoded = decodePortableBackup(settled);
    assert.equal(decoded.kind, 'session'); if (decoded.kind !== 'session') return;
    assert.ok(tabs.saves.importRecord(decoded.record)); const written = tabs.raw; assert.equal(tabs.record.expansion!.version, 2);
    assert.ok(tabs.runtime.enter().ok); assert.equal(tabs.record.expansion!.version, 3); assert.equal(tabs.record.perksBackup, written);
    // A live v4 backup keeps its v2 raid and expansion v2 through the import, the raid and the settlement.
    const raider = page(); assert.ok(raider.runtime.deploy({ world: 'mall', seed: 'live-v4' }).ok);
    const host = page(); assert.ok(importText(host, envelope(asV4(raider.raw))).ok);
    assert.equal(host.state.state, 'menu'); assert.equal(host.record.expansion!.version, 2); assert.equal(host.state.expansion!.raid!.version, 2);
    assert.ok(host.saves.resumeRun()); host.state.state = 'run'; assert.ok(host.saves.persist()); assert.equal(host.record.expansion!.version, 2);
    assert.ok(host.saves.prepareSettlement('timeout', 0)); assert.ok(host.saves.retrySettlement());
    const v4 = host.raw; assert.equal(host.record.expansion!.version, 2);
    host.state.state = 'result'; assert.ok(host.runtime.returnToBase().ok);
    assert.equal(host.record.expansion!.version, 3); assert.equal(host.record.perksBackup, v4);
});

test('CP-08: upgrading an old high-level save opens every reached tier without picking or granting anything; repeated imports grant nothing', () => {
    const source = page();
    source.setup(d => {
        Object.assign(d.expansion.growth, { permanent: { strength: 30, constitution: 25, technique: 15 }, progress: { strength: 0, constitution: .5, technique: .25 } });
        d.expansion.base.training.credited.technique = .3; d.profile.cash = 900;
    });
    const text = envelope(asV4(source.raw)), old = (JSON.parse(text).record as SessionRecord).expansion!;
    const p = page(), once = () => { assert.ok(importText(p, text).ok); return structuredClone(p.state.expansion!); };
    const first = once(), { version, growth: { perks, ...growth }, ...rest } = first, { version: oldVersion, growth: oldGrowth, ...oldRest } = old;
    assert.deepEqual([oldVersion, version], [2, 3]); assert.deepEqual(perks, []);
    assert.deepEqual(growth, oldGrowth); assert.deepEqual(rest, oldRest); assert.equal(p.state.save.cash, 900);
    assert.deepEqual(once(), first); assert.deepEqual(once(), first); assert.equal(p.state.save.cash, 900);
    // Every reached node is open at once, one side each, any mix; the next tier still needs its permanent level.
    const reached: PerkId[] = ['strength-15-b', 'strength-20-a', 'strength-25-b', 'strength-30-a', 'constitution-15-a', 'constitution-20-b', 'constitution-25-a', 'technique-15-a'];
    p.setup(d => { d.expansion.growth.perks = [...reached]; });
    assert.deepEqual(p.record.expansion!.growth.perks, reached);
    assert.throws(() => p.saves.prepareExpansionMutation(d => { d.expansion.growth.perks = [...reached, 'technique-20-a']; }));
    assert.deepEqual(p.record.expansion!.growth.perks, reached);
});

test('derived limits add the perk bonuses once and in v3 only; the validator accepts exactly the new limits', () => {
    const bound = newExpansion(NOW); upgradeToRpg(bound, NOW);
    bound.growth.permanent = { strength: 40, constitution: 40, technique: 40 }; // the design bound, above any stored level
    bound.growth.perks = ['strength-15-a', 'strength-20-b', 'strength-30-a', 'constitution-15-a'];
    const limits = derivedLimits(bound);
    assert.equal(limits.hp, 210); assert.equal(limits.stamina, 180); assert.ok(Math.abs(limits.carry - 52) < 1e-9);
    const before = derivedLimits({ ...bound, version: 2 });
    assert.equal(before.hp, 190); assert.equal(before.stamina, 160); assert.ok(Math.abs(before.carry - 42) < 1e-9);
    // A stored save reaches effective 35 (permanent 30 and a dose): hp 175 + 20 and stamina 150 + 20, and no more.
    const profile = D.newSave(), stored = newExpansion(NOW); upgradeToRpg(stored, NOW);
    stored.growth.permanent = { strength: 30, constitution: 30, technique: 30 };
    stored.body.effects.strength = 180; stored.body.effects.constitution = 180;
    stored.growth.perks = ['strength-15-a', 'strength-20-b', 'constitution-15-a'];
    Object.assign(stored.body, { hp: 195, stamina: 170 });
    assert.deepEqual(validateExpansion(stored, profile, null, resolveExpansionWorld), stored);
    for (const [key, value] of [['hp', 195.5], ['stamina', 170.5]] as const) {
        const over = structuredClone(stored); over.body[key] = value;
        assert.throws(() => validateExpansion(over, profile, null, resolveExpansionWorld), key);
    }
    const without = structuredClone(stored); without.growth.perks = [];
    assert.throws(() => validateExpansion(without, profile, null, resolveExpansionWorld), 'without the perks the same body is over the limits');
});
