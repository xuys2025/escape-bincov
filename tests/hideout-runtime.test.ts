import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { SaveSession, createSessionState, type ExpansionDraft } from '../src/session';
import { SESSION_KEY, decodeSession } from '../src/recovery-store';
import { decodePortableBackup } from '../src/save-backup';
import { RealHideoutRuntime, validPractice } from '../src/hideout-runtime';
import type { HideoutEvent, Result } from '../src/hideout-runtime';
import { equipCharm } from '../src/reputation-luck';
import { useRpgItem, useRpgItemResult } from '../src/rpg';
import { derivedLimits } from '../src/expansion-state';
import { oldProfile, oldRecord } from './fixtures/old-saves';
import { migrateProfile } from '../src/gunsmith/migrate';
import { relayoutProfile } from '../src/gunsmith/relayout';
import { factoryState } from '../src/gunsmith/instance';
function fixture(raw?: string, enter = true, allowed = () => true) {
    let now = 1800000000000, failed = false, writes = 0;
    if (raw?.includes('escape-bincov-session')) now = JSON.parse(raw).savedAt;
    const data = new Map<string, string>(); if (raw) data.set(raw.includes('escape-bincov-session') ? SESSION_KEY : D.SAVE_KEY, raw);
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { if (failed) throw Error('quota'); data.set(k, v); writes++; } };
    const state = createSessionState(), saves = new SaveSession(state, () => storage, undefined, () => now);
    const initialized = saves.initialize();
    const runtime = new RealHideoutRuntime(state, saves, () => now, allowed), events: HideoutEvent[] = [];
    runtime.subscribe(e => events.push(e));
    if (enter && initialized) assert.equal(runtime.enter().ok, true);
    const setup = (action: (draft: ExpansionDraft) => void) => { const ticket = saves.prepareExpansionMutation(action); assert.ok(ticket); assert.equal(saves.commitExpansionMutation(ticket), 'committed'); runtime.snapshot(); events.length = 0; };
    return { state, saves, runtime, events, setup, data, storage, initialized, get now() { return now; }, get writes() { return writes; }, get raw() { return data.get(SESSION_KEY)!; }, fail: (v = true) => { failed = v; }, advance: (ms: number) => { now += ms; } };
}
function reason(result: Result) { assert.equal(result.ok, false); return !result.ok && result.reason; }
function poorStation(full = false) {
    const f = fixture();
    f.setup(d => {
        d.profile.cash = 0; d.profile.equipment = { weapon: null, weaponUid: null, gun: null, relief: false, ammo: 0, ammoRelief: 0 };
        d.profile.bag = D.createInventory(6, 5); d.profile.stash = D.createInventory(D.STASH_W, D.STASH_ROWS); d.profile.safe = D.createInventory(2, 2);
        if (full) { D.addItem(d.profile.bag, 'watch', 60); D.addItem(d.profile.stash, 'watch', D.STASH_W * D.STASH_ROWS * D.ITEMS.watch.stack); }
    });
    f.state.state = 'menu'; return f;
}
test('station entry durably grants relief before any view and repeated entry writes nothing', () => {
    const f = poorStation(), revision = f.saves.revision;
    assert.ok(f.runtime.enter().ok); assert.equal(f.saves.revision, revision + 1);
    assert.equal(f.state.save.equipment.weapon, 'pistol'); assert.equal(f.state.save.equipment.relief, true);
    assert.equal(D.count(f.state.save.bag, 'ammo9'), 12); assert.equal(D.count(f.state.save.bag, 'bandage'), 1);
    assert.ok(f.state.save.bag.items.every(i => i.relief));
    const raw = f.raw, writes = f.writes; assert.ok(f.runtime.enter().ok);
    assert.equal(f.raw, raw); assert.equal(f.writes, writes);
    const g = fixture(raw, false); const afterLoad = g.raw; assert.ok(g.runtime.enter().ok); assert.equal(g.raw, afterLoad);
});
test('entry relief queues full inventories once and delivers only the remaining supplies as space opens', () => {
    const f = poorStation(true); assert.ok(f.runtime.enter().ok);
    assert.deepEqual(f.state.save.reliefSupplies, [{ id: 'ammo9', qty: 12 }, { id: 'bandage', qty: 1 }]);
    const raw = f.raw; assert.ok(f.runtime.enter().ok); assert.equal(f.raw, raw);
    f.setup(d => { D.removeItem(d.profile.bag, 'watch', 2); });
    assert.ok(f.runtime.enter().ok); assert.equal(D.count(f.state.save.bag, 'ammo9'), 12);
    assert.deepEqual(f.state.save.reliefSupplies, [{ id: 'bandage', qty: 1 }]);
    f.setup(d => { D.removeItem(d.profile.stash, 'watch', 2); });
    assert.ok(f.runtime.enter().ok); assert.equal(D.count(f.state.save.stash, 'bandage'), 1); assert.equal(f.state.save.reliefSupplies, undefined);
    assert.equal(reason(f.runtime.claimRelief()), 'rule'); // Existing explicit-claim contract is unchanged.
});
test('failed entry relief leaves menu and profile intact; retry then re-entry grants once', () => {
    const f = poorStation(), profile = structuredClone(f.state.save), expansion = structuredClone(f.state.expansion), raw = f.raw;
    f.fail(); assert.equal(reason(f.runtime.enter()), 'storage');
    assert.equal(f.state.state, 'menu'); assert.equal(f.raw, raw); assert.deepEqual(f.state.save, profile); assert.deepEqual(f.state.expansion, expansion);
    assert.equal(f.events.filter(e => e.type === 'committed').length, 0);
    f.fail(false); assert.ok(f.runtime.retrySave().ok); assert.deepEqual(f.state.save, profile);
    assert.ok(f.runtime.enter().ok); const delivered = f.raw; assert.ok(f.runtime.enter().ok); assert.equal(f.raw, delivered);
    assert.equal(D.count(f.state.save.bag, 'ammo9'), 12); assert.equal(D.count(f.state.save.bag, 'bandage'), 1);
});
test('entry keeps relief eligibility, active-raid and writer protection intact', () => {
    // Issue #26 F12/F04 moved the cash boundary from ¥200 to the pistol price (¥320) when nothing else can be sold.
    for (const source of ['cash', 'safe'] as const) {
        const f = poorStation(); f.setup(d => { if (source === 'cash') d.profile.cash = 320; else D.addItem(d.profile.safe, 'pistol'); });
        const raw = f.raw; assert.ok(f.runtime.enter().ok); assert.equal(f.raw, raw); assert.equal(f.state.save.equipment.weapon, null);
    }
    for (const cash of [200, 319]) {
        const f = poorStation(); f.setup(d => { d.profile.cash = cash; }); const revision = f.saves.revision;
        assert.ok(f.runtime.enter().ok); assert.equal(f.saves.revision, revision + 1); assert.equal(f.state.save.cash, cash);
        assert.equal(f.state.save.equipment.weapon, 'pistol'); assert.equal(f.state.save.equipment.relief, true);
        assert.equal(D.count(f.state.save.bag, 'ammo9'), 12); assert.equal(D.count(f.state.save.bag, 'bandage'), 1);
        const raw = f.raw; assert.ok(f.runtime.enter().ok); assert.equal(f.raw, raw);
    }
    const f = poorStation(), raw = f.raw; f.saves.markConflict(); assert.equal(reason(f.runtime.enter()), 'conflict'); assert.equal(f.raw, raw);
    const g = fixture(); assert.ok(g.runtime.deploy({ world: 'coast', seed: 'relief-entry' }).ok);
    const raid = g.raw; assert.equal(reason(g.runtime.enter()), 'locked'); assert.equal(g.raw, raid);
});
test('selling the last gun to reach ¥210 issues the relief kit in the same shop commit (S3)', () => {
    const f = poorStation(); f.setup(d => { d.profile.cash = 60; D.addItem(d.profile.stash, 'pistol'); });
    assert.ok(f.runtime.enter().ok); assert.equal(f.state.save.equipment.weapon, null); assert.equal(f.state.save.reliefSupplies, undefined);
    const shop = f.runtime.openShop('arms'), gun = shop.view().stash.items.find(i => i.id === 'pistol')!;
    assert.ok(shop.place('stash', 'sell', gun.uid, 0, 0).ok); const revision = f.saves.revision;
    assert.ok(shop.settle().ok); assert.equal(f.saves.revision, revision + 1);
    const saved = decodeSession(f.raw).profile;
    for (const save of [f.state.save, saved]) {
        assert.equal(save.cash, 210); assert.equal(save.stash.items.some(i => i.id === 'pistol'), false);
        assert.deepEqual(save.equipment, { weapon: 'pistol', weaponUid: save.equipment.weaponUid, gun: factoryState(), relief: true, ammo: 0, ammoRelief: 0 });
        assert.ok(save.equipment.weaponUid, 'the relief pistol is an instance with its own uid');
        assert.equal(D.count(save.bag, 'ammo9'), 12); assert.equal(D.count(save.bag, 'bandage'), 1); assert.ok(save.bag.items.every(i => i.relief));
    }
    const raw = f.raw; assert.ok(f.runtime.enter().ok); assert.equal(f.raw, raw);
});
test('re-entering a training station preserves accepted samples before relief commits', () => {
    const f = poorStation(); f.setup(d => { d.expansion.base.facilities.training = 1; d.expansion.base.training.attribute = 'strength'; });
    f.state.state = 'hideout'; f.runtime.setActivity(true); f.advance(250);
    f.runtime.practice({ from: { x: 332, y: 302 }, to: { x: 334, y: 302 }, seconds: .25, now: f.now });
    assert.equal(f.runtime.trainingProgress().pendingSeconds, .25); assert.ok(f.runtime.enter().ok);
    assert.equal(f.runtime.trainingProgress().activeSeconds, .25); assert.equal(f.state.save.equipment.weapon, 'pistol');
    assert.ok(f.runtime.flush().ok); assert.equal(f.runtime.snapshot().base.training.activeSeconds, .25);
});
function train(f: ReturnType<typeof fixture>, seconds: number) {
    f.runtime.setActivity(true);
    for (let i = 0; i < seconds * 4; i++) {
        f.advance(250); const x = i % 2 ? 334 : 332, nx = i % 2 ? 332 : 334;
        f.runtime.practice({ from: { x, y: 302 }, to: { x: nx, y: 302 }, seconds: .25, now: f.now });
        f.runtime.tick(f.now);
    }
}
test('station upgrades legacy bytes atomically, preserves progress and is idempotent', () => {
    const save = D.newSave(); save.cash = 4321; save.stats.runs = 7;
    const profile = oldProfile(save), old = JSON.stringify(profile), f = fixture(old, false), v3 = f.raw;
    assert.equal(f.runtime.enter().ok, true); const record = decodeSession(f.raw);
    // The legacy key's v2 profile arrives migrated (gunsmith M0-06): the same profile with factory guns.
    assert.deepEqual(record.profile, relayoutProfile(migrateProfile(profile))); assert.equal(record.version, 9); assert.equal(record.expansion?.version, 3);
    // Straight from a record without an expansion to expansion v3: the bytes without one are kept once, and there is
    // no v1/v2 expansion to keep; the legacy bytes stay in legacyBackup, so there is no gunsBackup.
    assert.equal(record.legacyBackup, old); assert.equal(record.systemsBackup, v3); assert.equal(record.perksBackup, null); assert.equal(record.gunsBackup, null);
    const rev = record.revision; assert.equal(f.runtime.enter().ok, true); assert.equal(f.saves.revision, rev);
});
test('failed upgrade preserves v3 raw and profile; retry succeeds once', () => {
    const f = fixture(undefined, false), raw = f.raw, profile = structuredClone(f.state.save); f.fail();
    assert.equal(reason(f.runtime.enter()), 'storage'); assert.equal(f.raw, raw); assert.deepEqual(f.state.save, profile); assert.equal(f.state.expansion, null);
    f.fail(false); assert.equal(f.runtime.retrySave().ok, true); assert.equal(f.runtime.enter().ok, true);
});
test('unknown/corrupt saves and non-owning window never overwrite storage', () => {
    const f = fixture('{', false); assert.equal(f.initialized, false); assert.equal(reason(f.runtime.enter()), 'storage'); assert.equal(f.data.get(D.SAVE_KEY), '{');
    const g = fixture(); const state = createSessionState(), s = new SaveSession(state, () => g.storage); assert.equal(s.initialize(false), false);
    const r = new RealHideoutRuntime(state, s); const raw = g.raw; assert.equal(reason(r.enter()), 'conflict'); assert.equal(g.raw, raw);
});
test('active legacy checkpoint is resumed without conversion or RNG changes', () => {
    const f = fixture(undefined, false); f.state.state = 'hideout'; assert.ok(f.saves.beginRun(567)); const saved = decodeSession(f.raw);
    const g = fixture(f.raw, false); assert.equal(reason(g.runtime.enter()), 'locked'); assert.deepEqual(g.state.checkpoint, saved.raid);
    assert.equal(g.saves.resumeRun(), true); assert.equal(g.state.expansion, null);
    g.state.state = 'run'; assert.ok(g.saves.prepareSettlement('extract', 0)); assert.ok(g.saves.retrySettlement()); g.state.state = 'result';
    assert.ok(g.runtime.returnToBase().ok); assert.equal(g.runtime.snapshot().storage.upgradeRequired, false);
});
test('snapshot and event payloads cannot mutate session; external tab commits observed once', () => {
    const f = fixture(); const snap = f.runtime.snapshot(); (snap.profile as D.SaveDataV1).cash = 999999; snap.base.facilities.rest = 3;
    assert.notEqual(f.state.save.cash, 999999); assert.equal(f.state.expansion!.base.facilities.rest, 0);
    f.events.length = 0; assert.ok(f.saves.setVolume(.3)); f.runtime.snapshot(); f.runtime.snapshot();
    assert.equal(f.events.filter(e => e.type === 'committed').length, 1);
    f.runtime.subscribe(() => { throw Error('view'); }); assert.ok(f.runtime.setVolume(.4).ok); assert.equal(f.state.save.settings.volume, .4);
});
test('equipped charm snapshot is detached, follows old-tab commits and reloads without moving inventory', () => {
    const f = fixture(); assert.equal(f.runtime.snapshot().charm, null);
    f.setup(d => { D.addItem(d.profile.stash, 'luckyCharm'); });
    const item = f.state.save.stash.items.find(i => i.id === 'luckyCharm')!;
    // The old tabs use the same session transaction, without the facade.
    const ticket = f.saves.prepareExpansionMutation(d => equipCharm(d.profile, d.expansion, item.uid, 'stash'))!;
    assert.equal(f.saves.commitExpansionMutation(ticket), 'committed');
    const snap = f.runtime.snapshot(), equipped = { uid: item.uid, id: item.id, qty: 1, x: 0, y: 0 };
    assert.deepEqual(snap.charm, equipped); assert.equal(D.count(snap.profile.stash, 'luckyCharm'), 0);
    (snap.charm as D.Item).id = 'unluckyCharm'; (snap.charm as D.Item).qty = 99;
    assert.deepEqual(f.runtime.snapshot().charm, equipped);
    const g = fixture(f.raw); assert.deepEqual(g.runtime.snapshot().charm, equipped);
    assert.equal(D.count(g.state.save.stash, 'luckyCharm'), 0);
    assert.ok(g.runtime.unequipCharm().ok); assert.equal(g.runtime.snapshot().charm, null);
    assert.equal(g.state.save.stash.items.find(i => i.id === 'luckyCharm')!.uid, item.uid);
});
test('failed charm replacement and removal preserve committed snapshots, raw bytes and item identities on retry', () => {
    const f = fixture(); f.setup(d => { D.addItem(d.profile.stash, 'luckyCharm'); D.addItem(d.profile.safe, 'unluckyCharm'); });
    const first = f.state.save.stash.items.find(i => i.id === 'luckyCharm')!, next = f.state.save.safe.items.find(i => i.id === 'unluckyCharm')!;
    assert.ok(f.runtime.equipCharm('stash', first.uid).ok);
    const before = f.runtime.snapshot(), raw = f.raw;
    f.fail(); assert.equal(reason(f.runtime.equipCharm('safe', next.uid)), 'storage');
    assert.equal(f.raw, raw); assert.deepEqual(f.runtime.snapshot().charm, before.charm);
    assert.deepEqual(f.runtime.snapshot().profile, before.profile);
    f.fail(false); assert.ok(f.runtime.retrySave().ok);
    assert.deepEqual(f.runtime.snapshot().charm, before.charm); // Retry saves; it does not silently re-equip.
    assert.ok(f.runtime.equipCharm('safe', next.uid).ok);
    assert.equal(f.runtime.snapshot().charm!.uid, next.uid);
    assert.equal(f.state.save.safe.items.filter(i => i.uid === first.uid).length, 1); // Replacement returns to its source container.
    assert.equal(D.count(f.state.save.safe, 'unluckyCharm'), 0);
    const replacement = f.runtime.snapshot(), replacementRaw = f.raw;
    f.fail(); assert.equal(reason(f.runtime.unequipCharm()), 'storage');
    assert.equal(f.raw, replacementRaw); assert.deepEqual(f.runtime.snapshot().charm, replacement.charm);
    assert.deepEqual(f.runtime.snapshot().profile, replacement.profile);
    f.fail(false); assert.ok(f.runtime.retrySave().ok); assert.ok(f.runtime.unequipCharm().ok);
    assert.equal(f.runtime.snapshot().charm, null);
    for (const uid of [first.uid, next.uid]) assert.equal([f.state.save.stash, f.state.save.bag, f.state.save.safe].flatMap(i => i.items).filter(i => i.uid === uid).length, 1);
    assert.equal(reason(f.runtime.unequipCharm()), 'rule');
});
test('run count begins at zero, preserves legacy seven, and increments only on committed departure', () => {
    assert.equal(fixture().runtime.snapshot().profile.stats.runs, 0);
    const profile = D.newSave(); profile.stats.runs = 7;
    const f = fixture(JSON.stringify(oldProfile(profile))); assert.equal(f.runtime.snapshot().profile.stats.runs, 7);
    assert.equal(f.runtime.snapshot().day, 8); // Keep the existing log-sequence contract.
    const raw = f.raw; f.fail(); assert.equal(reason(f.runtime.deploy({ world: 'buildings', seed: '42' })), 'storage');
    assert.equal(f.raw, raw); assert.equal(f.runtime.snapshot().profile.stats.runs, 7);
    f.fail(false); assert.ok(f.runtime.retrySave().ok);
    const start = f.runtime.deploy({ world: 'buildings', seed: '42' }); assert.ok(start.ok);
    assert.equal(f.runtime.snapshot().profile.stats.runs, 8);
    assert.equal(fixture(f.raw, false).runtime.snapshot().profile.stats.runs, 8);
    assert.ok(f.runtime.startRaid(start.runId!).ok); assert.equal(f.runtime.snapshot().profile.stats.runs, 8);
});
test('inventory split merge rotate transfer and failed write preserve identities and quantities', () => {
    const f = fixture(); f.setup(d => { d.profile.stash = D.createInventory(D.STASH_W, D.STASH_ROWS); d.profile.bag = D.createInventory(6, 5); D.addItem(d.profile.stash, 'ammo9', 20); D.addItem(d.profile.stash, 'pistol'); });
    const ammo = f.state.save.stash.items.find(i => i.id === 'ammo9')!;
    assert.ok(f.runtime.split('stash', ammo.uid, 5, 8, 5).ok); assert.equal(D.count(f.state.save.stash, 'ammo9'), 20);
    const split = f.state.save.stash.items.find(i => i.id === 'ammo9' && i.uid !== ammo.uid)!;
    assert.ok(f.runtime.move('stash', 'stash', split.uid, ammo.x, ammo.y, false).ok); assert.equal(D.count(f.state.save.stash, 'ammo9'), 20);
    const pistol = f.state.save.stash.items.find(i => i.id === 'pistol')!;
    assert.ok(f.runtime.move('stash', 'bag', pistol.uid, 0, 0, true).ok); assert.equal(f.state.save.bag.items[0].rotated, true);
    const before = structuredClone(f.state.save), raw = f.raw; f.events.length = 0; f.fail();
    assert.equal(reason(f.runtime.equip('bag', pistol.uid)), 'storage'); assert.deepEqual(f.state.save, before); assert.equal(f.raw, raw); assert.deepEqual(f.events.map(e => e.type), ['save-failed']);
    f.fail(false); assert.ok(f.runtime.retrySave().ok); assert.ok(f.runtime.equip('bag', pistol.uid).ok); assert.equal(f.state.save.equipment.weapon, 'pistol');
});
test('raw compare conflict becomes permanent read-only without retry overwrite', () => {
    const f = fixture(), newer = f.raw + ' '; f.data.set(SESSION_KEY, newer);
    assert.equal(reason(f.runtime.setVolume(.25)), 'conflict'); assert.equal(f.state.conflict, true);
    assert.equal(reason(f.runtime.retrySave()), 'conflict'); assert.equal(f.raw, newer);
});
test('shop retains disposable cart on quota failure and publishes exactly one settlement', () => {
    const f = fixture(), shop = f.runtime.openShop('arms'), stock = shop.view().catalog.items.find(i => i.id === 'ammo9')!;
    assert.ok(shop.place('merchant', 'buy', stock.uid, 0, 0).ok); const before = structuredClone(f.state.save); f.fail();
    assert.equal(reason(shop.settle()), 'storage'); assert.deepEqual(f.state.save, before); assert.equal(shop.view().buy.items.length, 1);
    f.fail(false); assert.ok(f.runtime.retrySave().ok); assert.ok(shop.settle().ok);
    assert.equal(f.state.save.cash, before.cash - D.ITEMS.ammo9.buy * 12); assert.equal(shop.view().placement, 'automatic-stash'); assert.equal(reason(shop.settle()), 'rule');
});
test('shop reasons distinguish funds, stale stash and invalid moves', () => {
    const f = fixture(); f.setup(d => { d.profile.cash = 0; }); const shop = f.runtime.openShop('arms'), stock = shop.view().catalog.items.find(i => i.id === 'carbine')!;
    assert.ok(shop.place('merchant', 'buy', stock.uid, 0, 0).ok); assert.equal(reason(shop.settle()), 'funds');
    assert.equal(reason(shop.place('merchant', 'stash', stock.uid, 0, 0)), 'rule');
    f.setup(d => { D.addItem(d.profile.stash, 'watch'); }); assert.equal(reason(shop.settle()), 'stale');
});
test('shop rejections tell the player whether cash or stash space is missing without changing the cart', () => {
    for (const blockedBy of ['funds', 'space'] as const) {
        const f = fixture(); f.setup(d => {
            d.profile.cash = blockedBy === 'funds' ? 0 : 5000;
            if (blockedBy === 'space') { d.profile.stash = D.createInventory(D.STASH_W, D.STASH_ROWS); D.addItem(d.profile.stash, 'watch', D.STASH_W * D.STASH_ROWS * D.ITEMS.watch.stack); }
        });
        const shop = f.runtime.openShop('arms'), stock = shop.view().catalog.items.find(i => i.id === 'pistol')!;
        assert.ok(shop.place('merchant', 'buy', stock.uid, 0, 0).ok);
        const raw = f.raw, cart = shop.view(), result = shop.settle();
        assert.equal(reason(result), blockedBy);
        assert.match(!result.ok ? result.message : '', blockedBy === 'funds' ? /现金不足/ : /仓库空间不足/);
        assert.equal(f.raw, raw); assert.deepEqual(shop.view(), cart);
    }
});
test('a stale empty cart exposes refresh and reset rebuilds it without reopening or writing progress', () => {
    const f = fixture(), shop = f.runtime.openShop('arms');
    f.setup(d => { D.addItem(d.profile.stash, 'watch'); });
    const raw = f.raw;
    assert.equal(shop.view().stale, true); assert.equal(shop.view().dirty, false);
    const stock = shop.view().catalog.items[0];
    assert.equal(reason(shop.place('merchant', 'buy', stock.uid, 0, 0)), 'stale');
    shop.reset(); assert.equal(shop.view().stale, false);
    assert.deepEqual(shop.view().stash, f.state.save.stash); assert.equal(f.raw, raw);
    assert.ok(shop.place('merchant', 'buy', shop.view().catalog.items[0].uid, 0, 0).ok);
});
test('stale cart reset discards the old sale confirmation and never takes over another writer', () => {
    const f = fixture(); f.setup(d => { D.addItem(d.profile.stash, 'fuse'); });
    const shop = f.runtime.openShop('arms'), fuse = shop.view().stash.items.find(i => i.id === 'fuse')!;
    assert.ok(shop.place('stash', 'sell', fuse.uid, 0, 0).ok);
    const first = shop.settle(); assert.ok(!first.ok && first.confirmation);
    f.setup(d => { D.addItem(d.profile.stash, 'watch'); });
    assert.equal(reason(shop.settle(!first.ok ? first.confirmation!.token : '')), 'stale');
    shop.reset(); assert.ok(shop.place('stash', 'sell', fuse.uid, 0, 0).ok);
    const again = shop.settle(!first.ok ? first.confirmation!.token : ''); assert.ok(!again.ok && again.confirmation);
    const cart = shop.view(), raw = f.raw; f.saves.markConflict(); shop.reset();
    assert.deepEqual(shop.view(), cart); assert.equal(reason(shop.settle()), 'conflict'); assert.equal(f.raw, raw);
});
test('quest sale requires confirmation bound to the cart and quest need', () => {
    const f = fixture(); f.setup(d => { D.addItem(d.profile.stash, 'fuse'); });
    const shop = f.runtime.openShop('arms'), fuse = shop.view().stash.items.find(i => i.id === 'fuse')!;
    assert.ok(shop.place('stash', 'sell', fuse.uid, 0, 0).ok); const first = shop.settle(); assert.equal(first.ok, false); assert.ok(!first.ok && first.confirmation);
    assert.ok(shop.place('sell', 'sell', fuse.uid, 1, 0).ok);
    const second = shop.settle(!first.ok ? first.confirmation!.token : ''); assert.ok(!second.ok && second.confirmation);
    assert.ok(shop.settle(!second.ok ? second.confirmation!.token : '').ok);
});
test('the station shop refuses to list relief guns or rounds for sale', () => {
    const f = fixture(); f.setup(d => { D.addItem(d.profile.stash, 'pistol', 1, true); D.addItem(d.profile.stash, 'ammo9', 12, true); });
    const shop = f.runtime.openShop('arms'), raw = f.raw;
    for (const id of ['pistol', 'ammo9']) {
        const item = shop.view().stash.items.find(i => i.id === id && i.relief)!;
        assert.match(shop.placementError('stash', 'sell', item.uid, 0, 0)!, /不可出售/, id);
        const result = shop.place('stash', 'sell', item.uid, 0, 0);
        assert.equal(reason(result), 'rule'); assert.match(!result.ok ? result.message : '', /不可出售/, id);
    }
    assert.equal(shop.view().sell.items.length, 0); assert.equal(reason(shop.settle()), 'rule'); assert.equal(f.raw, raw);
});
test('facilities enforce power, non-relief materials and three-level cap', () => {
    const f = fixture(); assert.equal(reason(f.runtime.build('training')), 'locked');
    f.setup(d => { d.profile.cash = 5000; d.profile.stash = D.createInventory(D.STASH_W, D.STASH_ROWS); D.addItem(d.profile.stash, 'scrap', 10, true); });
    assert.equal(reason(f.runtime.build('rest')), 'materials'); assert.equal(f.state.save.cash, 5000);
    f.setup(d => { D.addItem(d.profile.stash, 'scrap', 10); D.addItem(d.profile.stash, 'wire', 10); });
    for (let i = 0; i < 3; i++) assert.ok(f.runtime.build('rest').ok);
    assert.equal(reason(f.runtime.build('rest')), 'locked'); assert.equal(D.count(f.state.save.stash, 'scrap'), 14);
});
test('production cancels only waiting batches, refunds once, completes and claims atomically', () => {
    const f = fixture(); f.setup(d => { d.profile.cash = 9000; d.expansion.base.facilities.workbench = 3; D.addItem(d.profile.stash, 'cloth', 10); });
    assert.ok(f.runtime.enqueue('bandage').ok); assert.ok(f.runtime.enqueue('bandage').ok);
    const [head, tail] = f.runtime.snapshot().base.queue;
    assert.equal(reason(f.runtime.cancel(head.id)), 'rule'); const cash = f.state.save.cash;
    assert.ok(f.runtime.cancel(tail.id).ok); assert.equal(f.state.save.cash, cash + 35); assert.equal(reason(f.runtime.cancel(tail.id)), 'rule');
    f.advance(600000); f.runtime.tick(f.now); assert.equal(f.runtime.snapshot().base.completed.length, 1);
    const raw = f.raw; f.fail(); assert.equal(reason(f.runtime.claim(head.id, 'bag')), 'storage'); assert.equal(f.raw, raw); assert.equal(f.runtime.snapshot().base.completed.length, 1);
    f.fail(false); assert.ok(f.runtime.retrySave().ok); assert.ok(f.runtime.claim(head.id, 'bag').ok); assert.equal(reason(f.runtime.claim(head.id, 'bag')), 'stale');
});
test('training rejects pools, excess speed, false clocks, stationary and hidden inputs', () => {
    const f = fixture(); f.setup(d => { d.expansion.base.facilities.training = 1; }); assert.ok(f.runtime.selectPractice('strength').ok);
    const sample = { from: { x: 332, y: 302 }, to: { x: 334, y: 302 }, seconds: .25, now: f.now + 250 };
    assert.equal(validPractice({ ...sample, from: { x: 400, y: 350 }, to: { x: 402, y: 350 } }), false);
    assert.equal(validPractice({ ...sample, to: { x: 500, y: 302 } }), false);
    f.advance(250); f.runtime.practice(sample); f.runtime.setActivity(true);
    f.runtime.practice({ ...sample, now: f.now + 100 }); f.runtime.practice({ ...sample, from: sample.to });
    f.advance(5000); f.runtime.tick(f.now); assert.equal(f.runtime.snapshot().base.training.activeSeconds, 0);
});
test('training credits only after 120 real active seconds and shares persisted ten-minute cap', () => {
    const f = fixture(); f.setup(d => { d.expansion.base.facilities.training = 1; }); assert.ok(f.runtime.selectPractice('strength').ok);
    train(f, 120); assert.equal(f.runtime.snapshot().base.training.activeSeconds, 0); assert.equal(f.state.expansion!.growth.progress.strength, .052500000000000005);
    assert.ok(f.runtime.selectPractice('technique').ok); train(f, 360);
    assert.equal(f.state.expansion!.base.training.quantity, 1); const g = fixture(f.raw); train(g, 100); assert.equal(g.state.expansion!.base.training.quantity, 1);
});
test('failed five-second checkpoint retains exact training for retry and backup', () => {
    const f = fixture(); f.setup(d => { d.expansion.base.facilities.training = 1; }); assert.ok(f.runtime.selectPractice('strength').ok);
    f.fail(); train(f, 5); assert.equal(f.runtime.snapshot().base.training.activeSeconds, 0); assert.equal(f.runtime.snapshot().storage.pendingBase, true);
    const backup = decodePortableBackup(f.runtime.exportBackup()); assert.ok(backup.kind === 'session'); assert.equal(backup.record.expansion!.base.training.activeSeconds, 5);
    f.fail(false); assert.ok(f.runtime.retrySave().ok); assert.equal(f.runtime.snapshot().base.training.activeSeconds, 5);
    assert.equal(f.runtime.snapshot().storage.pendingBase, false); assert.ok(f.runtime.retrySave().ok); assert.equal(f.runtime.snapshot().base.training.activeSeconds, 5);
});
test('departure saves once before animation, locks actions and refresh resumes exact checkpoint', () => {
    const f = fixture(); f.fail(); assert.equal(reason(f.runtime.deploy({ world: 'buildings', seed: '42' })), 'storage'); assert.equal(f.state.save.activeRun, null);
    f.fail(false); assert.ok(f.runtime.retrySave().ok); const start = f.runtime.deploy({ world: 'buildings', seed: '42' }); assert.ok(start.ok && start.runId);
    assert.equal(f.runtime.snapshot().phase, 'departing'); assert.equal(reason(f.runtime.setVolume(.2)), 'locked');
    const record = decodeSession(f.raw), g = fixture(f.raw, false); assert.ok(g.saves.resumeRun()); assert.deepEqual(g.state.expansion?.raid, record.expansion?.raid);
    const rev = f.saves.revision; assert.ok(f.runtime.startRaid(start.runId!).ok); assert.equal(f.saves.revision, rev); assert.equal(reason(f.runtime.startRaid(start.runId!)), 'stale');
});
test('a zero deploy seed starts buildings and the mall as the seed-1 raid; the coast keeps seed 0', () => {
    const layout = (raw: string) => {
        const raid = decodeSession(raw).expansion!.raid!;
        return JSON.stringify([raid.initialHigh, raid.rng, Object.values(raid.maps).map(m => [m.loot.map(i => [i.id, i.qty, i.x, i.y]), m.containers.map(c => c.inventory.items.map(i => [i.id, i.qty]))])]);
    };
    for (const world of ['buildings', 'mall'] as const) {
        const one = fixture(); assert.ok(one.runtime.deploy({ world, seed: '1' }).ok);
        for (const seed of ['0', '4294967296']) {
            const f = fixture(), start = f.runtime.deploy({ world, seed });
            assert.ok(start.ok, `${world} seed ${seed}`); assert.equal(f.state.storageOK, true);
            const record = decodeSession(f.raw);
            assert.equal(record.profile.activeRun?.seed, 1); assert.equal(record.expansion!.raid!.seed, 1);
            assert.equal(layout(f.raw), layout(one.raw));
            const g = fixture(f.raw, false); assert.ok(g.saves.resumeRun()); assert.deepEqual(g.state.expansion?.raid, record.expansion?.raid);
        }
    }
    const coast = fixture(); assert.ok(coast.runtime.deploy({ world: 'coast', seed: '0' }).ok);
    const record = decodeSession(coast.raw); assert.equal(record.profile.activeRun?.seed, 0); assert.equal(record.raid?.seed, 0);
});
test('pending real settlement blocks return; success produces one ephemeral arrival', () => {
    const f = fixture(); const start = f.runtime.deploy({ world: 'buildings', seed: '333' }); assert.ok(start.ok); assert.ok(f.runtime.startRaid(start.runId!).ok);
    assert.ok(f.saves.prepareSettlement('extract', 2)); f.fail(); assert.equal(f.saves.retrySettlement(), false); assert.equal(reason(f.runtime.returnToBase()), 'storage'); assert.equal(f.runtime.snapshot().arrival, null);
    f.fail(false); assert.ok(f.saves.retrySettlement()); f.state.state = 'result'; assert.ok(f.runtime.returnToBase().ok);
    assert.equal(f.runtime.consumeArrival()?.runId, start.runId); assert.equal(f.runtime.consumeArrival(), null); assert.equal(reason(f.runtime.returnToBase()), 'locked');
    const g = fixture(f.raw); assert.equal(g.runtime.snapshot().arrival, null);
});
test('import confirmation is exact-text and revision-bound; corrupt and downgrade cannot overwrite', () => {
    const f = fixture(), backup = f.runtime.exportBackup(), preview = f.runtime.previewImport(backup); assert.ok(preview.ok && preview.token);
    assert.equal(reason(f.runtime.importBackup(backup + ' ', preview.token!)), 'stale'); assert.ok(f.runtime.setVolume(.2).ok);
    assert.equal(reason(f.runtime.importBackup(backup, preview.token!)), 'stale'); assert.equal(reason(f.runtime.previewImport('{')), 'rule');
    const next = f.runtime.previewImport(backup); assert.ok(f.runtime.importBackup(backup, next.token!).ok);
    const old = JSON.stringify(D.newSave()), legacy = f.runtime.previewImport(old), raw = f.raw;
    assert.ok(legacy.ok); assert.equal(reason(f.runtime.importBackup(old, legacy.token!)), 'locked'); assert.equal(f.raw, raw);
});

test('failed base checkpoint blocks old-tab writers and their exports include pending training', () => {
    const f = fixture(); f.setup(d => { d.expansion.base.facilities.training = 1; }); assert.ok(f.runtime.selectPractice('strength').ok);
    f.fail(); train(f, 5); f.fail(false); const raw = f.raw, cash = f.state.save.cash;
    assert.equal(f.saves.setVolume(.2), false); assert.equal(f.saves.beginRun(42), false);
    assert.equal(f.saves.mutate(() => { f.state.save.cash++; return true; }), 'save-failed');
    assert.equal(f.state.save.cash, cash); assert.equal(f.raw, raw); assert.equal(f.saves.backupRecord()!.expansion!.base.training.activeSeconds, 5);
    assert.ok(f.runtime.retrySave().ok); assert.equal(f.state.expansion!.base.training.activeSeconds, 5); assert.ok(f.saves.setVolume(.2));
});
test('power event occurs once after durable quest turn-in, never on quota failure or duplicate', () => {
    const f = fixture(); f.setup(d => { for (const [id, qty] of Object.entries(D.QUESTS.repair.needs)) D.addItem(d.profile.stash, id, qty); });
    const before = structuredClone(f.state.save); f.fail(); assert.equal(reason(f.runtime.submitQuest('repair')), 'storage'); assert.deepEqual(f.state.save, before);
    assert.equal(f.runtime.snapshot().power, 'emergency'); assert.equal(f.events.some(e => e.type === 'power-restored'), false);
    f.fail(false); assert.ok(f.runtime.retrySave().ok); assert.ok(f.runtime.submitQuest('repair').ok); assert.equal(f.runtime.snapshot().power, 'restored');
    assert.equal(reason(f.runtime.submitQuest('repair')), 'rule'); assert.equal(f.events.filter(e => e.type === 'power-restored').length, 1);
});
test('shop full stash returns space without paying for a rejected purchase', () => {
    const f = fixture(); f.setup(d => { d.profile.cash = 10000; d.profile.stash.items = []; for (let i = 0; i < D.STASH_W * D.STASH_ROWS; i++) D.addItem(d.profile.stash, 'watch', D.ITEMS.watch.stack); });
    const shop = f.runtime.openShop('arms'), item = shop.view().catalog.items.find(i => i.id === 'pistol')!; assert.ok(shop.place('merchant', 'buy', item.uid, 0, 0).ok);
    const raw = f.raw; assert.equal(reason(shop.settle()), 'space'); assert.equal(f.raw, raw);
});
test('base supplies and secure transfers use one transaction with body and inventory', () => {
    const f = fixture(); f.setup(d => { d.expansion.body.hp = 40; });
    const item = f.state.save.bag.items.find(i => i.id === 'bandage')!, before = structuredClone(f.state);
    f.fail(); assert.equal(reason(f.runtime.useSupply('bag', item.uid)), 'storage'); assert.deepEqual(f.state.save, before.save); assert.deepEqual(f.state.expansion, before.expansion);
    f.fail(false); assert.ok(f.runtime.retrySave().ok); assert.ok(f.runtime.useSupply('bag', item.uid).ok); assert.equal(f.state.expansion!.body.hp, 56);
    assert.ok(f.runtime.secure('bag', item.uid).ok); assert.equal(D.count(f.state.save.safe, 'bandage'), 1); assert.equal(reason(f.runtime.equip('safe', f.state.save.safe.items[0].uid)), 'rule');
});
test('failed full-backup import preserves profile, growth, queue and confirmation for retry', () => {
    const f = fixture(), g = fixture(); g.setup(d => { d.profile.cash = 4321; d.expansion.growth.permanent.strength = 14; d.expansion.base.facilities.rest = 2; });
    const text = g.runtime.exportBackup(), preview = f.runtime.previewImport(text), raw = f.raw;
    f.fail(); assert.equal(reason(f.runtime.importBackup(text, preview.token!)), 'storage'); assert.equal(f.raw, raw);
    f.fail(false); assert.ok(f.runtime.retrySave().ok); // A retry checkpoint changed revision: re-confirm the exact file.
    assert.equal(reason(f.runtime.importBackup(text, preview.token!)), 'stale'); const next = f.runtime.previewImport(text);
    assert.ok(f.runtime.importBackup(text, next.token!).ok); assert.equal(f.state.save.cash, 4321); assert.equal(f.state.expansion!.growth.permanent.strength, 14); assert.equal(f.state.expansion!.base.facilities.rest, 2);
});
test('v1 expansion upgrade preserves body, facilities and growth without double upgrade', () => {
    const f = fixture(); const record = oldRecord(decodeSession(f.raw), 4); record.expansion.version = 1; delete record.expansion.charm; delete record.expansion.awards;
    delete record.perksBackup; delete record.expansion.growth.perks;
    record.expansion.body.hp = 47; record.expansion.growth.permanent.technique = 13; record.expansion.base.facilities.rest = 2;
    const g = fixture(JSON.stringify(record)); assert.equal(g.state.expansion!.version, 3); assert.equal(g.state.expansion!.body.hp, 47);
    assert.deepEqual(g.state.expansion!.growth.perks, []);
    assert.equal(g.state.expansion!.growth.permanent.technique, 13); assert.equal(g.state.expansion!.base.facilities.rest, 2); assert.equal(g.saves.currentRecord()!.systemsBackup, record.systemsBackup);
    // Loading wrote the record as v8 with the v1 expansion (the old text is gunsBackup); the perk upgrade then kept that text.
    const v4 = JSON.parse(g.saves.currentRecord()!.perksBackup!);
    assert.equal(v4.version, 9); assert.equal(v4.expansion.version, 1); assert.equal('perksBackup' in v4, false);
    assert.equal(g.saves.currentRecord()!.gunsBackup, JSON.stringify(record));
});
test('offline production remains finite and cannot bank blocked time; offline movement is never credited', () => {
    const f = fixture(); f.setup(d => { d.profile.cash = 100000; d.expansion.base.facilities.workbench = 3; d.expansion.base.facilities.training = 1; D.addItem(d.profile.stash, 'cloth', 20); });
    for (let i = 0; i < 3; i++) assert.ok(f.runtime.enqueue('bandage').ok);
    f.advance(86400000); f.runtime.tick(f.now); assert.equal(f.runtime.snapshot().base.completed.length, 3); assert.equal(f.runtime.snapshot().base.training.quantity, 0);
    assert.ok(f.runtime.enqueue('bandage').ok); f.advance(86400000); f.runtime.tick(f.now); assert.equal(f.runtime.snapshot().base.completed.length, 3);
    const id = f.runtime.snapshot().base.completed[0].id; assert.ok(f.runtime.claim(id, 'stash').ok);
    assert.equal(f.runtime.snapshot().base.completed.length, 3); // One paid batch reached its end while capacity was full.
    assert.equal(f.runtime.snapshot().base.queue.length, 0);
    assert.ok(f.runtime.enqueue('bandage').ok); const remaining = f.runtime.snapshot().base.queue[0].remaining;
    assert.equal(remaining, 420); // Earlier blocked idle time does not produce this newly paid batch.
});
test('practice rejects repeated timestamps, teleport continuity, out-of-zone and suspended frames', () => {
    const f = fixture(); f.setup(d => { d.expansion.base.facilities.training = 1; }); assert.ok(f.runtime.selectPractice('constitution').ok); f.runtime.setActivity(true);
    f.advance(250); const frame = { from: { x: 332, y: 302 }, to: { x: 334, y: 302 }, seconds: .25, now: f.now };
    f.runtime.practice(frame); f.runtime.practice(frame); f.advance(250);
    f.runtime.practice({ ...frame, from: { x: 600, y: 302 }, to: { x: 602, y: 302 }, now: f.now });
    f.runtime.setActivity(false); f.advance(5000); f.runtime.practice({ ...frame, now: f.now }); f.runtime.tick(f.now);
    assert.equal(f.runtime.snapshot().base.training.activeSeconds, .25);
});
test('all mutation entry points give conflict priority and cannot mutate after disposal', () => {
    const f = fixture(); f.saves.markConflict();
    for (const result of [f.runtime.move('stash', 'bag', 'bad', -1, 0, false), f.runtime.split('bag', 'bad', 0, 0, 0), f.runtime.equip('safe', 'bad'), f.runtime.setVolume(NaN), f.runtime.build('training'), f.runtime.selectPractice('strength')]) assert.equal(reason(result), 'conflict');
    const g = fixture(); assert.ok(g.runtime.backToMenu().ok); assert.equal(g.state.state, 'menu'); assert.ok(g.runtime.enter().ok); assert.ok(g.runtime.dispose().ok);
    const raw = g.raw; assert.equal(reason(g.runtime.setVolume(.4)), 'locked'); g.advance(10000); g.runtime.tick(g.now); assert.equal(g.raw, raw);
});

test('split defaults to the source rotation and retains relief provenance', () => {
    const f = fixture(); f.setup(d => { D.addItem(d.profile.stash, 'water', 2, true, true); });
    const water = f.state.save.stash.items.find(i => i.id === 'water')!;
    assert.ok(f.runtime.split('stash', water.uid, 1, 8, 4).ok);
    const parts = f.state.save.stash.items.filter(i => i.id === 'water'); assert.equal(parts.length, 2);
    assert.ok(parts.every(i => i.rotated && i.relief)); assert.equal(new Set(parts.map(i => i.uid)).size, 2);
});
test('economy overflow fails as a rule result without throwing, charging or losing the cart', () => {
    const f = fixture(); f.setup(d => { d.profile.cash = 1e9; D.addItem(d.profile.stash, 'watch'); });
    const shop = f.runtime.openShop('arms'), item = shop.view().stash.items.find(i => i.id === 'watch')!;
    assert.ok(shop.place('stash', 'sell', item.uid, 0, 0).ok); const raw = f.raw;
    assert.equal(reason(shop.settle()), 'rule'); assert.equal(f.raw, raw); assert.equal(shop.view().sell.items.length, 1);
});

test('60 FPS fractional frame seconds survive integer wall-clock rounding without extra credit', () => {
    const f = fixture(); f.setup(d => { d.expansion.base.facilities.training = 1; }); assert.ok(f.runtime.selectPractice('strength').ok); f.runtime.setActivity(true);
    for (let i = 0; i < 120 * 60; i++) {
        f.advance(Math.round((i + 1) * 1000 / 60) - Math.round(i * 1000 / 60));
        const from = { x: i % 2 ? 334 : 332, y: 302 }, to = { x: i % 2 ? 332 : 334, y: 302 };
        f.runtime.practice({ from, to, seconds: 1 / 60, now: f.now }); f.runtime.tick(f.now);
    }
    assert.ok(Math.abs(f.runtime.snapshot().base.training.activeSeconds) < 1e-6);
    assert.equal(f.state.expansion!.growth.progress.strength, .052500000000000005);
});

function trainingFixture(allowed?: () => boolean) {
    const f = fixture(undefined, true, allowed); f.setup(d => { d.expansion.base.facilities.training = 1; });
    assert.ok(f.runtime.selectPractice('strength').ok); return f;
}
function sample(f: ReturnType<typeof fixture>, i = 0) {
    f.advance(250); f.runtime.practice({ from: { x: i % 2 ? 334 : 332, y: 302 }, to: { x: i % 2 ? 332 : 334, y: 302 }, seconds: .25, now: f.now });
}
test('effective training view shows sub-checkpoint samples, is detached and has no read side effects', () => {
    const f = trainingFixture(); f.runtime.setActivity(true);
    const raw = f.raw, writes = f.writes, revision = f.saves.revision, events = structuredClone(f.events);
    for (let i = 0; i < 7; i++) sample(f, i);
    const view = f.runtime.trainingProgress(); assert.equal(view.saved.activeSeconds, 0); assert.equal(view.activeSeconds, 1.75); assert.equal(view.pendingSeconds, 1.75);
    for (let i = 0; i < 10; i++) assert.deepEqual(f.runtime.trainingProgress(), view);
    (view.saved as { activeSeconds: number }).activeSeconds = 999; (view.pendingGrowth as Record<string, number>).strength = 99;
    assert.equal(f.runtime.trainingProgress().saved.activeSeconds, 0); assert.equal(f.runtime.trainingProgress().pendingGrowth.strength, 0);
    assert.equal(f.raw, raw); assert.equal(f.writes, writes); assert.equal(f.saves.revision, revision); assert.deepEqual(f.events, events);
    f.advance(3250); f.runtime.tick(f.now);
    assert.equal(f.runtime.trainingProgress().activeSeconds, 1.75); assert.equal(f.runtime.trainingProgress().pendingSeconds, 0);
    assert.equal(f.runtime.snapshot().base.training.activeSeconds, 1.75);
});
test('effective view ignores every rejected sample, suspended activity and absent training prerequisites', () => {
    let allowed = true; const f = trainingFixture(() => allowed); f.runtime.setActivity(true); sample(f);
    const frame = { from: { x: 334, y: 302 }, to: { x: 332, y: 302 }, seconds: .25, now: f.now };
    f.runtime.practice(frame); // repeated timestamp
    f.advance(250);
    for (const invalid of [{ ...frame, now: f.now + 1 }, { ...frame, now: f.now - 2000 }, { ...frame, seconds: 1, now: f.now },
        { ...frame, from: frame.to, now: f.now }, { ...frame, to: { x: 500, y: 302 }, now: f.now },
        { ...frame, from: { x: 400, y: 350 }, to: { x: 402, y: 350 }, now: f.now },
        { ...frame, from: { x: 200, y: 300 }, to: { x: 202, y: 300 }, now: f.now }]) f.runtime.practice(invalid);
    allowed = false; sample(f, 1); allowed = true; f.runtime.setActivity(false); sample(f, 1);
    assert.equal(f.runtime.trainingProgress().pendingSeconds, .25);
    const g = fixture(); g.runtime.setActivity(true); sample(g); assert.equal(g.runtime.trainingProgress().status, 'unavailable'); assert.equal(g.runtime.trainingProgress().pendingSeconds, 0);
    g.setup(d => { d.expansion.base.facilities.training = 1; }); assert.equal(g.runtime.trainingProgress().status, 'select');
});
test('failed reward checkpoint projects its exact candidate once; only retry announces durable growth', () => {
    const f = trainingFixture(); train(f, 115); const raw = f.raw, before = structuredClone(f.state.expansion); f.events.length = 0;
    f.fail(); train(f, 5); const view = f.runtime.trainingProgress();
    assert.equal(view.status, 'storage'); assert.equal(view.saved.activeSeconds, 115); assert.equal(view.pendingSeconds, 5);
    assert.equal(view.activeSeconds, 0); assert.equal(view.quantity, .2625); assert.ok(Math.abs(view.pendingGrowth.strength - .0525) < 1e-9);
    assert.deepEqual(f.state.expansion, before); assert.equal(f.raw, raw); assert.equal(f.events.filter(e => e.type === 'practice-credited').length, 0);
    const backup = decodePortableBackup(f.runtime.exportBackup()); assert.ok(backup.kind === 'session');
    assert.equal(backup.record.expansion!.base.training.activeSeconds, view.activeSeconds); assert.equal(backup.record.expansion!.base.training.quantity, view.quantity);
    for (let i = 0; i < 5; i++) assert.deepEqual(f.runtime.trainingProgress(), view);
    f.fail(false); assert.ok(f.runtime.retrySave().ok); assert.ok(f.runtime.retrySave().ok);
    assert.equal(f.runtime.trainingProgress().pendingSeconds, 0); assert.equal(f.runtime.trainingProgress().quantity, view.quantity);
    assert.equal(f.events.filter(e => e.type === 'practice-credited').length, 1);
    assert.equal(f.runtime.trainingProgress().pendingGrowth.strength, 0);
});
test('cap, shared attribute switch and ten-minute boundary project original practice without resetting on reads', () => {
    const f = trainingFixture(); train(f, 120); assert.ok(f.runtime.selectPractice('technique').ok); train(f, 360);
    const view = f.runtime.trainingProgress(); assert.equal(view.capped, true); assert.equal(view.quantity, 1); assert.equal(view.status, 'capped');
    train(f, 2); assert.equal(f.runtime.trainingProgress().pendingSeconds, 0); assert.equal(f.runtime.trainingProgress().quantity, 1);
    f.advance(600000); const raw = f.raw; assert.equal(f.runtime.trainingProgress().windowExpired, true); assert.equal(f.runtime.trainingProgress().capped, false); assert.equal(f.raw, raw);
    sample(f); const next = f.runtime.trainingProgress(); assert.equal(next.activeSeconds, .25); assert.equal(next.quantity, 0); assert.equal(next.pendingSeconds, .25);
    assert.equal(next.pendingWindow, true);
    assert.equal(f.runtime.snapshot().base.training.quantity, 1); assert.ok(f.runtime.flush().ok);
    assert.equal(f.runtime.trainingProgress().saved.quantity, 0); assert.equal(f.runtime.trainingProgress().saved.activeSeconds, .25);
});
test('switching, reload and external writers never attach unsaved samples to a new revision', () => {
    const f = trainingFixture(); f.runtime.setActivity(true); sample(f); assert.ok(f.runtime.selectPractice('constitution').ok);
    assert.equal(f.runtime.trainingProgress().attribute, 'constitution'); assert.equal(f.runtime.trainingProgress().saved.activeSeconds, .25); assert.equal(f.runtime.trainingProgress().pendingSeconds, 0);
    sample(f, 1); const g = fixture(f.raw); assert.equal(g.runtime.trainingProgress().activeSeconds, .25); assert.equal(g.runtime.trainingProgress().pendingSeconds, 0);
    const before = f.raw; assert.ok(f.saves.setVolume(.3)); assert.notEqual(f.raw, before);
    assert.equal(f.runtime.trainingProgress().activeSeconds, .25); assert.equal(f.runtime.trainingProgress().pendingSeconds, 0);
    const backup = decodePortableBackup(f.runtime.exportBackup()); assert.ok(backup.kind === 'session'); assert.equal(backup.record.expansion!.base.training.activeSeconds, .25);
    f.runtime.snapshot(); f.runtime.setActivity(false); f.runtime.setActivity(true); sample(f);
    assert.equal(f.runtime.trainingProgress().pendingSeconds, .25);
    assert.ok(f.runtime.backToMenu().ok); assert.ok(f.runtime.enter().ok); assert.equal(f.runtime.trainingProgress().pendingSeconds, 0); assert.equal(f.runtime.trainingProgress().activeSeconds, .5);
});
test('a stale retained candidate stays exportable but is never mixed with replacement training', () => {
    const f = trainingFixture(); f.fail(); train(f, 5); const backup = f.runtime.exportBackup();
    // A hostile in-memory change cannot bypass the ticket identity / before-state check.
    f.state.expansion!.base.training.activeSeconds = 42; f.fail(false);
    assert.equal(reason(f.runtime.retrySave()), 'stale'); assert.equal(f.runtime.exportBackup(), backup);
    assert.equal(f.runtime.trainingProgress().status, 'stale'); assert.equal(f.runtime.trainingProgress().activeSeconds, 42); assert.equal(f.runtime.trainingProgress().pendingSeconds, 0);
    f.saves.markConflict(); const view = f.runtime.trainingProgress(); assert.equal(view.status, 'conflict');
    const raw = f.raw; sample(f); assert.equal(f.raw, raw); assert.equal(reason(f.runtime.useSupply('bag', 'missing')), 'conflict');
});
test('supply rejection types preserve all bytes and transaction protection takes priority', () => {
    const f = fixture(); f.setup(d => { const l = derivedLimits(d.expansion); d.expansion.body.hp = l.hp; d.expansion.body.stamina = l.stamina; d.expansion.body.water = 100; d.expansion.body.pollution = 0; D.addItem(d.profile.stash, 'scrap'); });
    const raw = f.raw, state = structuredClone(f.state), water = f.state.save.bag.items.find(i => i.id === 'water')!;
    assert.equal(reason(f.runtime.useSupply('bag', 'missing')), 'missing-item');
    assert.equal(reason(f.runtime.useSupply('stash', f.state.save.stash.items.find(i => i.id === 'scrap')!.uid)), 'not-supply');
    const refused = f.runtime.useSupply('bag', water.uid); assert.equal(reason(refused), 'no-effect'); assert.ok(!refused.ok && /水分.*耐力.*污染/.test(refused.message));
    assert.equal(f.raw, raw); assert.deepEqual(f.state, state);
    f.state.storageOK = false; assert.equal(reason(f.runtime.useSupply('bag', 'missing')), 'storage');
    f.saves.markConflict(); assert.equal(reason(f.runtime.useSupply('bag', 'missing')), 'conflict');
    const g = fixture(); g.state.state = 'menu'; assert.equal(reason(g.runtime.useSupply('bag', 'missing')), 'locked');
});
test('water, food and medicine remain usable for each secondary effect at full primary resource', () => {
    for (const [id, field, value] of [['water', 'stamina', 30], ['water', 'pollution', 12], ['food', 'hp', 40], ['food', 'stamina', 30], ['medkit', 'bleeding', true]] as const) {
        const f = fixture(); f.setup(d => { const b = d.expansion.body, l = derivedLimits(d.expansion); b.hp = l.hp; b.stamina = l.stamina; b.water = b.satiety = 100; b.pollution = 0; Object.assign(b, { [field]: value }); d.profile.stash = D.createInventory(D.STASH_W, D.STASH_ROWS); D.addItem(d.profile.stash, id); });
        const item = f.state.save.stash.items[0]; assert.ok(f.runtime.useSupply('stash', item.uid).ok, `${id} ${field}`);
        assert.equal(D.count(f.state.save.stash, id), 0); assert.notEqual(f.state.expansion!.body[field], value);
    }
});
test('sustained supplies retain exact renewal and opposite-luck replacement boundaries and boolean callers', () => {
    for (const [id, effect, duration] of [['analgesic', 'analgesia', 180], ['focus', 'focus', 120], ['strengthDose', 'strength', 180], ['constitutionDose', 'constitution', 180], ['techniqueDose', 'technique', 180], ['luckySachet', 'luck', 300], ['unluckySachet', 'luck', 300]] as const) {
        const f = fixture(), e = f.state.expansion!; assert.ok(useRpgItem(e, id)); const before = structuredClone(e);
        assert.deepEqual(useRpgItemResult(e, id).ok, false); assert.deepEqual(e, before); e.body.effects[effect] = duration - 1;
        assert.ok(useRpgItemResult(e, id).ok); assert.equal(e.body.effects[effect], duration);
    }
    const f = fixture(), e = f.state.expansion!; assert.ok(useRpgItem(e, 'luckySachet')); assert.ok(useRpgItemResult(e, 'unluckySachet').ok); assert.equal(e.body.luckEffect, -1);
    assert.equal(useRpgItem(e, 'scrap'), false); assert.equal(useRpgItemResult(e, 'scrap').ok, false);
});
