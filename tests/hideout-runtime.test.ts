import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { SaveSession, createSessionState, type ExpansionDraft } from '../src/session';
import { SESSION_KEY, decodeSession } from '../src/recovery-store';
import { decodePortableBackup } from '../src/save-backup';
import { RealHideoutRuntime, validPractice } from '../src/hideout-runtime';
import type { HideoutEvent, Result } from '../src/hideout-runtime';
function fixture(raw?: string, enter = true) {
    let now = 1800000000000, failed = false, writes = 0;
    if (raw?.includes('escape-bincov-session')) now = JSON.parse(raw).savedAt;
    const data = new Map<string, string>(); if (raw) data.set(raw.includes('escape-bincov-session') ? SESSION_KEY : D.SAVE_KEY, raw);
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { if (failed) throw Error('quota'); data.set(k, v); writes++; } };
    const state = createSessionState(), saves = new SaveSession(state, () => storage, undefined, () => now);
    const initialized = saves.initialize();
    const runtime = new RealHideoutRuntime(state, saves, () => now), events: HideoutEvent[] = [];
    runtime.subscribe(e => events.push(e));
    if (enter && initialized) assert.equal(runtime.enter().ok, true);
    const setup = (action: (draft: ExpansionDraft) => void) => { const ticket = saves.prepareExpansionMutation(action); assert.ok(ticket); assert.equal(saves.commitExpansionMutation(ticket), 'committed'); runtime.snapshot(); events.length = 0; };
    return { state, saves, runtime, events, setup, data, storage, initialized, get now() { return now; }, get writes() { return writes; }, get raw() { return data.get(SESSION_KEY)!; }, fail: (v = true) => { failed = v; }, advance: (ms: number) => { now += ms; } };
}
function reason(result: Result) { assert.equal(result.ok, false); return !result.ok && result.reason; }
function train(f: ReturnType<typeof fixture>, seconds: number) {
    f.runtime.setActivity(true);
    for (let i = 0; i < seconds * 4; i++) {
        f.advance(250); const x = i % 2 ? 334 : 332, nx = i % 2 ? 332 : 334;
        f.runtime.practice({ from: { x, y: 302 }, to: { x: nx, y: 302 }, seconds: .25, now: f.now });
        f.runtime.tick(f.now);
    }
}
test('station upgrades legacy bytes atomically, preserves progress and is idempotent', () => {
    const profile = D.newSave(); profile.cash = 4321; profile.stats.runs = 7;
    const old = JSON.stringify(profile), f = fixture(old, false), v3 = f.raw;
    assert.equal(f.runtime.enter().ok, true); const record = decodeSession(f.raw);
    assert.deepEqual(record.profile, profile); assert.equal(record.expansion?.version, 2);
    assert.equal(record.legacyBackup, old); assert.equal(record.systemsBackup, v3);
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
test('inventory split merge rotate transfer and failed write preserve identities and quantities', () => {
    const f = fixture(); f.setup(d => { d.profile.stash = D.createInventory(10, 6); d.profile.bag = D.createInventory(6, 5); D.addItem(d.profile.stash, 'ammo9', 20); D.addItem(d.profile.stash, 'pistol'); });
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
test('quest sale requires confirmation bound to the cart and quest need', () => {
    const f = fixture(); f.setup(d => { D.addItem(d.profile.stash, 'fuse'); });
    const shop = f.runtime.openShop('arms'), fuse = shop.view().stash.items.find(i => i.id === 'fuse')!;
    assert.ok(shop.place('stash', 'sell', fuse.uid, 0, 0).ok); const first = shop.settle(); assert.equal(first.ok, false); assert.ok(!first.ok && first.confirmation);
    assert.ok(shop.place('sell', 'sell', fuse.uid, 1, 0).ok);
    const second = shop.settle(!first.ok ? first.confirmation!.token : ''); assert.ok(!second.ok && second.confirmation);
    assert.ok(shop.settle(!second.ok ? second.confirmation!.token : '').ok);
});
test('facilities enforce power, non-relief materials and three-level cap', () => {
    const f = fixture(); assert.equal(reason(f.runtime.build('training')), 'locked');
    f.setup(d => { d.profile.cash = 5000; d.profile.stash = D.createInventory(10, 6); D.addItem(d.profile.stash, 'scrap', 10, true); });
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
    const f = fixture(); f.setup(d => { d.profile.cash = 10000; d.profile.stash.items = []; for (let i = 0; i < 60; i++) D.addItem(d.profile.stash, 'watch', D.ITEMS.watch.stack); });
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
    const f = fixture(); const record = decodeSession(f.raw); record.expansion!.version = 1; delete record.expansion!.charm; delete record.expansion!.awards;
    record.expansion!.body.hp = 47; record.expansion!.growth.permanent.technique = 13; record.expansion!.base.facilities.rest = 2;
    const g = fixture(JSON.stringify(record)); assert.equal(g.state.expansion!.version, 2); assert.equal(g.state.expansion!.body.hp, 47);
    assert.equal(g.state.expansion!.growth.permanent.technique, 13); assert.equal(g.state.expansion!.base.facilities.rest, 2); assert.equal(g.saves.currentRecord()!.systemsBackup, record.systemsBackup);
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
