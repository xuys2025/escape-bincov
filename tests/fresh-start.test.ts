import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { SaveSession, createSessionState, type ExpansionDraft } from '../src/session';
import { SESSION_KEY, decodeSession, type SessionRecord } from '../src/recovery-store';
import { decodePortableBackup } from '../src/save-backup';
import { RealHideoutRuntime, type Result } from '../src/hideout-runtime';
import { FACILITIES } from '../src/expansion-state';
import { RESET_COPY_KEY, confirmImport, freshStartRecord, freshStartText, isPristine, readResetCopy, startOver } from '../src/fresh-start';
import { factoryState } from '../src/gunsmith/instance';

const NOW = 1800000000000;
/** One browser origin: every page shares this Map; `failing` injects a quota error for chosen keys only. */
function origin() {
    const data = new Map<string, string>(), failing = new Set<string>(), writes: string[] = [];
    const storage: D.StorageLike = { getItem: k => data.get(k) ?? null, setItem: (k, v) => { if (failing.has(k)) throw new Error('quota'); data.set(k, v); writes.push(k); } };
    return { data, failing, writes, storage };
}
type Origin = ReturnType<typeof origin>;
/** One page: SaveSession + Runtime on the shared origin. `owned` is the page-lifetime lock. */
function page(o: Origin = origin(), owned = true) {
    const clock = { now: NOW }, state = createSessionState(), saves = new SaveSession(state, () => o.storage, undefined, () => clock.now);
    saves.initialize(owned);
    const runtime = new RealHideoutRuntime(state, saves, () => clock.now), downloads: string[] = [];
    if (owned) assert.ok(runtime.enter().ok);
    const setup = (action: (draft: ExpansionDraft) => void) => {
        const ticket = saves.prepareExpansionMutation(action); assert.ok(ticket); assert.equal(saves.commitExpansionMutation(ticket), 'committed'); runtime.snapshot();
    };
    return { o, clock, state, saves, runtime, downloads, setup,
        reset: (storage: () => D.StorageLike = () => o.storage) => startOver(runtime, storage, clock.now, text => downloads.push(text)),
        get raw() { return o.data.get(SESSION_KEY) ?? null; }, get copy() { return o.data.get(RESET_COPY_KEY) ?? null; } };
}
type Page = ReturnType<typeof page>;
function reason(result: Result) { assert.equal(result.ok, false); return !result.ok && result.reason; }
const owned = (p: D.SaveDataV1, id: string) => [p.stash, p.bag, p.safe].reduce((n, inv) => n + D.count(inv, id), 0);
/** A long-played profile: cash, stats, quest, upgraded stash, goods, facility, growth, body and volume all differ. */
function rich(f: Page) {
    f.setup(d => {
        d.profile.cash = 4921; d.profile.quests.repair = true; assert.ok(D.upgradeStash(d.profile));
        d.profile.stats = { runs: 9, extracts: 4, kills: 17 }; d.profile.settings.volume = .6; D.addItem(d.profile.stash, 'watch', 3);
        d.expansion.base.facilities.rest = 2; d.expansion.growth.permanent.strength = 14; d.expansion.growth.progress.technique = .4; d.expansion.body.hp = 60;
    });
    assert.equal(f.state.save.cash, 4321);
}
function assertFresh(f: Page, volume: number) {
    const s = f.runtime.snapshot(), p = s.profile;
    assert.equal(p.cash, 700); assert.deepEqual(p.stats, { runs: 0, extracts: 0, kills: 0 }); assert.deepEqual(p.quests, { repair: false, sample: false, ledger: false });
    assert.equal(p.upgraded, false); assert.equal(p.stash.h, 8); assert.equal(owned(p, 'watch'), 0); assert.equal(p.settings.volume, volume);
    assert.ok(FACILITIES.every(id => s.base.facilities[id] === 0)); assert.equal(s.body.attributes.strength.base, 10); assert.equal(s.body.attributes.technique.progress, 0);
    assert.equal(s.body.hp, 100); assert.equal(f.state.state, 'hideout'); assert.ok(isPristine(decodeSession(f.raw!)));
}

test('fresh start record is a strict v9 session with the starter kit and the old volume only', () => {
    const data = decodePortableBackup(freshStartText(.6, NOW));
    assert.equal(data.kind, 'session'); if (data.kind !== 'session') return;
    const r = data.record, p = r.profile, e = r.expansion!;
    assert.equal(r.version, 10); assert.equal(r.perksBackup, null); assert.equal(r.gunsBackup, null); assert.equal(r.layoutBackup, null); assert.equal(e.version, 3); assert.deepEqual(e.growth.perks, []);
    assert.equal(e.charm, null); assert.deepEqual(e.awards, []); assert.equal(e.raid, null);
    assert.equal(r.raid, null); assert.equal(r.terminal, null); assert.equal(p.activeRun, null);
    assert.equal(p.cash, 700); assert.deepEqual(p.stats, { runs: 0, extracts: 0, kills: 0 }); assert.equal(p.settings.volume, .6);
    assert.deepEqual(p.equipment, { weapon: 'pistol', weaponUid: p.equipment.weaponUid, gun: factoryState(), relief: false, ammo: 0, ammoRelief: 0 });
    assert.ok(p.equipment.weaponUid);
    assert.deepEqual(['ammo9', 'bandage', 'water', 'medkit'].map(id => owned(p, id)), [56, 2, 1, 1]);
    assert.ok(FACILITIES.every(id => e.base.facilities[id] === 0)); assert.deepEqual(e.growth.permanent, { strength: 10, constitution: 10, technique: 10 });
    assert.equal(e.base.cursor, NOW); assert.ok(isPristine(r));
    assert.throws(() => freshStartText(2, NOW), 'the strict decoder still validates the generated record');
});

test('pristine means equal in substance to a fresh start; any real progress is not pristine', () => {
    const base = () => freshStartRecord(.35, NOW);
    // Volume, item layout, stack splits, carrying instead of equipping the pistol, body and time are not progress.
    const moved = base(), p = moved.profile, e = moved.expansion!;
    p.settings.volume = 0; assert.ok(D.unequip(p));
    const ammo = p.bag.items.find(i => i.id === 'ammo9')!; assert.ok(D.transferItem(p.bag, p.stash, ammo.uid));
    e.body.hp = 40; e.body.effects.energized = 600; e.base.restSeconds = 120; e.base.energizedGranted = true; e.base.cursor += 3600000;
    assert.equal(owned(p, 'pistol'), 1); assert.ok(isPristine(moved));
    const cases: [string, (r: SessionRecord) => void][] = [
        ['cash', r => { r.profile.cash = 699; }], ['runs', r => { r.profile.stats.runs = 1; }], ['kills', r => { r.profile.stats.kills = 1; }],
        ['quest', r => { r.profile.quests.repair = true; }], ['stash upgrade', r => { r.profile.upgraded = true; }],
        ['used supply', r => { assert.ok(D.removeItem(r.profile.bag, 'bandage', 1)); }], ['extra goods', r => { D.addItem(r.profile.stash, 'watch'); }],
        ['relief gun', r => { r.profile.equipment.relief = true; }], ['loaded magazine', r => { r.profile.equipment.ammo = 8; }],
        ['pending relief', r => { r.profile.reliefSupplies = [{ id: 'bandage', qty: 1 }]; }],
        ['last result', r => { r.profile.lastResult = { outcome: 'death', kills: 0, keptValue: 0, lostValue: 0, seed: 1, recovered: false, message: '' }; }],
        ['live raid', r => { r.profile.activeRun = { seed: 1, runId: 'r1' }; }],
        ['facility', r => { r.expansion!.base.facilities.rest = 1; }], ['production', r => { r.expansion!.base.extractedPearl = true; }],
        ['growth', r => { r.expansion!.growth.permanent.strength = 11; }], ['progress', r => { r.expansion!.growth.progress.technique = .1; }],
        ['reputation', r => { r.expansion!.growth.reputation.harbor = 1; }], ['luck', r => { r.expansion!.growth.luck = 2; }],
        ['charm', r => { r.expansion!.charm = { uid: 'charm-1', id: 'watch', qty: 1, x: 0, y: 0 }; }], ['awards', r => { r.expansion!.awards = ['award-1']; }],
        ['training credit', r => { r.expansion!.base.training.quantity = .25; }], ['practice seconds', r => { r.expansion!.base.training.activeSeconds = 30; }],
    ];
    for (const [name, change] of cases) { const r = base(); change(r); assert.equal(isPristine(r), false, name); }
});

test('reset from a long-played profile wipes it, keeps volume, downloads the old save and keeps one local copy', () => {
    const f = page(); rich(f);
    const before = decodeSession(f.raw!), revision = f.saves.revision, expected = f.runtime.exportBackup();
    assert.deepEqual(f.reset(), { ok: true, copied: true });
    assert.equal(f.saves.revision, revision + 1); assertFresh(f, .6);
    assert.deepEqual(f.downloads, [expected]); assert.equal(f.copy, expected);
    const copy = decodePortableBackup(f.copy!); assert.equal(copy.kind, 'session');
    if (copy.kind === 'session') { assert.equal(copy.record.profile.cash, 4321); assert.equal(copy.record.expansion!.base.facilities.rest, 2); }
    // Commit keeps the invisible recovery bytes of the record (legacy/migration/pre-v4/pre-v5) exactly as before.
    const after = decodeSession(f.raw!);
    assert.deepEqual([after.legacyBackup, after.migrationBackup, after.systemsBackup, after.perksBackup],
        [before.legacyBackup, before.migrationBackup, before.systemsBackup, before.perksBackup]);
    // A later page load on the same origin reads the fresh start.
    const reload = page(f.o); assert.equal(reload.state.save.stats.runs, 0); assert.equal(reload.state.save.cash, 700);
});

test('a failed session write rolls the reset back; retry and the next reset succeed', () => {
    const f = page(); rich(f);
    const raw = f.raw, save = structuredClone(f.state.save), expansion = structuredClone(f.state.expansion), revision = f.saves.revision, backup = f.runtime.exportBackup();
    f.o.failing.add(SESSION_KEY);
    assert.equal(reason(f.reset()), 'storage');
    assert.equal(f.raw, raw); assert.equal(f.saves.revision, revision); assert.deepEqual(f.state.save, save); assert.deepEqual(f.state.expansion, expansion);
    assert.equal(f.copy, backup, 'the copy was kept before the import; it holds the unchanged save');
    f.o.failing.delete(SESSION_KEY);
    assert.ok(f.runtime.retrySave().ok); assert.equal(f.state.save.cash, 4321);
    assert.deepEqual(f.reset(), { ok: true, copied: true }); assertFresh(f, .6);
});

test('a copy that cannot be kept stops the reset before the save or a download is touched', () => {
    for (const block of ['quota', 'access'] as const) {
        const f = page(); rich(f); const raw = f.raw, writes = f.o.writes.length;
        if (block === 'quota') f.o.failing.add(RESET_COPY_KEY);
        const result = block === 'quota' ? f.reset() : f.reset(() => { throw new DOMException('denied', 'SecurityError'); });
        assert.equal(reason(result), 'storage'); assert.equal(!result.ok && result.message, '备份没有保存，存档没有清空。');
        assert.equal(f.raw, raw); assert.equal(f.copy, null); assert.deepEqual(f.downloads, []); assert.equal(f.o.writes.length, writes);
        assert.equal(f.state.storageOK, true); assert.equal(f.state.save.cash, 4321);
        f.o.failing.clear(); assert.ok(f.reset().ok); assertFresh(f, .6);
    }
});

test('blocked pages write neither the session nor the copy and download nothing', () => {
    const blocked = (f: Page, expected: string) => {
        const raw = f.raw, writes = f.o.writes.length, save = structuredClone(f.state.save);
        assert.equal(reason(f.reset()), expected);
        assert.equal(f.raw, raw); assert.equal(f.copy, null); assert.deepEqual(f.downloads, []); assert.equal(f.o.writes.length, writes); assert.deepEqual(f.state.save, save);
    };
    const conflict = page(); rich(conflict); conflict.saves.markConflict(); blocked(conflict, 'conflict');
    // A second page without the lock on the same origin.
    const o = origin(), holder = page(o); rich(holder); const viewer = page(o, false);
    assert.equal(viewer.saves.ownsStorage, false); assert.equal(viewer.state.save.cash, 4321); blocked(viewer, 'conflict');
    const raid = page(); rich(raid); assert.ok(raid.runtime.deploy({ world: 'coast', seed: 'reset-raid' }).ok); blocked(raid, 'locked');
    const settlement = page(); rich(settlement); const run = settlement.runtime.deploy({ world: 'buildings', seed: 'reset-settle' });
    assert.ok(run.ok && run.runId); assert.ok(settlement.runtime.startRaid(run.runId!).ok); assert.ok(settlement.saves.prepareSettlement('death', 0));
    blocked(settlement, 'locked');
    // A failed base checkpoint stays exclusive until it is retried.
    const pending = page(); rich(pending); pending.o.failing.add(SESSION_KEY); pending.clock.now += 6000; pending.runtime.tick(pending.clock.now);
    pending.o.failing.delete(SESSION_KEY); assert.equal(pending.runtime.snapshot().storage.pendingBase, true);
    blocked(pending, 'storage');
    assert.ok(pending.runtime.retrySave().ok); assert.deepEqual(pending.reset(), { ok: true, copied: true }); assertFresh(pending, .6);
});

test('two pages on one storage: after a reset the stale page is refused and marked conflicted', () => {
    const o = origin(), b = page(o), a = page(o); rich(a);
    assert.deepEqual(a.reset(), { ok: true, copied: true }); const fresh = a.raw, copy = a.copy;
    // B still holds the bytes it loaded; its next commit hits the compare-and-write check.
    assert.equal(reason(b.runtime.setVolume(.2)), 'conflict'); assert.equal(b.state.conflict, true);
    assert.equal(a.raw, fresh);
    assert.equal(reason(b.reset()), 'conflict'); assert.equal(a.raw, fresh); assert.equal(a.copy, copy); assert.deepEqual(b.downloads, []);
});

test('the copy restores through preview/import, stays after the restore and is replaced only by a later real reset', () => {
    const f = page(); rich(f); assert.ok(f.reset().ok);
    const copy = readResetCopy(() => f.o.storage); assert.ok(copy); assert.equal(copy, f.copy);
    const preview = f.runtime.previewImport(copy!); assert.ok(preview.ok && preview.token);
    assert.ok(f.runtime.importBackup(copy!, preview.token!).ok);
    const s = f.runtime.snapshot();
    assert.equal(s.profile.cash, 4321); assert.equal(s.base.facilities.rest, 2); assert.equal(s.profile.stats.runs, 9); assert.equal(s.body.attributes.strength.base, 14);
    assert.equal(f.copy, copy, 'restoring keeps the copy');
    f.setup(d => { d.profile.cash = 5000; }); const current = f.runtime.exportBackup();
    assert.deepEqual(f.reset(), { ok: true, copied: true }); assert.equal(f.copy, current);
    assert.equal(readResetCopy(() => { throw new DOMException('denied', 'SecurityError'); }), null);
});

test('a second reset of a still pristine save keeps the pre-reset copy', () => {
    const f = page(); rich(f); assert.deepEqual(f.reset(), { ok: true, copied: true }); const copy = f.copy;
    // Time in the station and moving the starter kit around are not progress.
    f.clock.now += 3 * 60000; f.setup(d => { assert.ok(D.unequip(d.profile)); });
    assert.equal(f.state.expansion!.base.energizedGranted, true); assert.equal(f.state.save.equipment.weapon, null);
    assert.deepEqual(f.reset(), { ok: true, copied: false });
    assert.equal(f.copy, copy); assert.equal(f.downloads.length, 2, 'the backup is still downloaded'); assertFresh(f, .6);
    // One real change (a purchase) makes the next reset replace the copy.
    assert.equal(f.runtime.openShop('arms').view().catalog.items.some(i => i.id === 'ammo9'), true);
    f.setup(d => { d.profile.cash -= 84; D.addItem(d.profile.stash, 'ammo9', 12); }); const current = f.runtime.exportBackup();
    assert.deepEqual(f.reset(), { ok: true, copied: true }); assert.equal(f.copy, current); assert.notEqual(f.copy, copy);
});

test('a base checkpoint while the restore dialog is open does not void the confirmed overwrite', () => {
    const f = page(); rich(f); assert.ok(f.reset().ok);
    const copy = readResetCopy(() => f.o.storage)!; assert.ok(copy);
    // 恢复清空前的存档 previews once to open the overwrite confirmation.
    const opened = f.runtime.previewImport(copy); assert.ok(opened.ok && opened.token);
    // The yard calls tick() every frame while the dialog is open; past five seconds the base checkpoint commits.
    const revision = f.saves.revision; f.clock.now += 6000; f.runtime.tick(f.clock.now);
    assert.equal(f.saves.revision, revision + 1, 'the checkpoint committed while the dialog was open');
    const raw = f.raw, writes = f.o.writes.length;
    // Negative control: the previous confirm path reused the token of that first preview and was refused.
    const stale = f.runtime.importBackup(copy, opened.token!);
    assert.equal(reason(stale), 'stale'); assert.equal(!stale.ok && stale.message, '请重新预览并确认覆盖。');
    assert.equal(f.raw, raw); assert.equal(f.o.writes.length, writes);
    // The confirm path previews again and restores in one session commit.
    assert.deepEqual(confirmImport(f.runtime, copy), { ok: true });
    assert.equal(f.saves.revision, revision + 2); assert.deepEqual(f.o.writes.slice(writes), [SESSION_KEY]);
    const s = f.runtime.snapshot();
    assert.equal(s.profile.cash, 4321); assert.equal(s.base.facilities.rest, 2); assert.equal(s.profile.stats.runs, 9); assert.equal(s.body.attributes.strength.base, 14);
    assert.equal(f.copy, copy, 'restoring keeps the copy'); assert.equal(f.downloads.length, 1, 'a restore downloads nothing');
    // The same holds for an imported backup file and for a confirmation that waited through several checkpoints.
    f.setup(d => { d.profile.cash = 5000; }); const file = f.runtime.exportBackup(); f.setup(d => { d.profile.cash = 10; });
    assert.ok(f.runtime.previewImport(file).ok); const opened2 = f.saves.revision;
    for (let i = 0; i < 3; i++) { f.clock.now += 5000; f.runtime.tick(f.clock.now); }
    assert.equal(f.saves.revision, opened2 + 3, 'three checkpoints while the dialog was open');
    assert.ok(confirmImport(f.runtime, file).ok); assert.equal(f.runtime.snapshot().profile.cash, 5000);
});

test('the confirmed import keeps every guard: blocked pages and a newer write elsewhere change nothing', () => {
    const refused = (f: Page, text: string, expected: string) => {
        const raw = f.raw, writes = f.o.writes.length, save = structuredClone(f.state.save), result = confirmImport(f.runtime, text);
        assert.equal(reason(result), expected); assert.equal(f.raw, raw); assert.equal(f.o.writes.length, writes); assert.deepEqual(f.state.save, save);
        return result;
    };
    const backup = (f: Page) => { const text = f.runtime.exportBackup(); f.setup(d => { d.profile.cash = 1; }); return text; };
    const conflict = page(); rich(conflict); const text = backup(conflict); conflict.saves.markConflict(); refused(conflict, text, 'conflict');
    const o = origin(), holder = page(o); rich(holder); const viewer = page(o, false); refused(viewer, holder.runtime.exportBackup(), 'conflict');
    const raid = page(); rich(raid); const before = backup(raid); assert.ok(raid.runtime.deploy({ world: 'coast', seed: 'import-raid' }).ok); refused(raid, before, 'locked');
    const pending = page(); rich(pending); const kept = backup(pending); pending.o.failing.add(SESSION_KEY); pending.clock.now += 6000; pending.runtime.tick(pending.clock.now);
    pending.o.failing.delete(SESSION_KEY); assert.equal(pending.runtime.snapshot().storage.pendingBase, true); refused(pending, kept, 'storage');
    const broken = page(); rich(broken);
    assert.equal(refused(broken, '{"format":"escape-bincov-recovery-backup"', 'rule').message, '备份损坏或版本不兼容。');
    // Another page commits after this page opened its dialog: the compare-and-write commit refuses the overwrite.
    const shared = origin(), a = page(shared); rich(a);
    const restore = a.runtime.exportBackup(); a.setup(d => { d.profile.cash = 2; }); assert.ok(a.runtime.previewImport(restore).ok);
    const mine = a.raw, b = page(shared); assert.ok(b.runtime.setVolume(.1).ok); const written = a.raw; assert.notEqual(written, mine);
    assert.equal(reason(confirmImport(a.runtime, restore)), 'conflict'); assert.equal(a.raw, written); assert.equal(a.state.conflict, true);
});
