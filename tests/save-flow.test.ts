import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { app, saveSession } from '../src/app';
import { RecoveryStore, SESSION_KEY, decodeSession } from '../src/recovery-store';
import { initialCheckpoint } from '../src/checkpoint';
import { generateRun } from '../src/world';
const read = () => new RecoveryStore(localStorage).load().save;
function begin() { saveSession.beginRun(42); return app.loadout!; }
import { retrySettlement, mutate, importSave, setOverlay, render } from '../src/ui';
import * as Shop from '../src/shop';
import { toast } from '../src/toast';
import { decodeBackup, decodePortableBackup, encodeBackup, encodeRecoveryBackup } from '../src/save-backup';
import { PROFILE_MAX_BYTES } from '../src/profile-codec';

let stored: string | null;
let failWrites: boolean;
let writes: number;
// Buttons the page binds on render (bind() looks them up with '[data-action]').
let buttons: { dataset: Record<string, string>; onclick?: () => void }[] = [];
const screen = { innerHTML: '', style: {}, querySelectorAll: (selector: string) => selector === '[data-action]' ? buttons : [], querySelector: () => null };
const notification = { textContent: '', style: {} };
const globals = new Map<string, PropertyDescriptor | undefined>();
/**
 * The raid host's end of a run (CoastRaidRuntime.finish): stage the settlement once, then write it. A failed write
 * leaves it pending for the page's save-error dialog (retrySettlement below).
 */
function settle(outcome: 'extract' | 'death' | 'timeout' | 'abandon', kills: number) {
  if (!saveSession.prepareSettlement(outcome, kills)) return false;
  return saveSession.retrySettlement();
}

beforeEach(() => {
  stored = null; failWrites = false; writes = 0; buttons = [];
  for (const key of ['document', 'localStorage', 'innerWidth', 'innerHeight']) globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
  Object.defineProperty(globalThis, 'innerWidth', { configurable: true, value: 1280 });
  Object.defineProperty(globalThis, 'innerHeight', { configurable: true, value: 720 });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { body: { dataset: {} }, documentElement: { dataset: {}, classList: { remove() {}, add() {} }, style: { setProperty() {} } }, dispatchEvent() {}, getElementById: (id: string) => id === 'ui' ? screen : id === 'toast' ? notification : null,
    // Item icons paint into a canvas; without a 2D context they are simply left out.
    createElement: () => ({ getContext: () => null }) } });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => key === SESSION_KEY ? stored : null,
    setItem: (_key: string, value: string) => { if (failWrites) throw new Error('quota exceeded'); stored = value; writes++; },
  } });
  Object.assign(app, { checkpoint: null, pendingRecoveryImport: null, storageError: '', lastSavedAt: 0, save: D.newSave(), state: 'hideout', loadout: null, tab: 'gear', shop: null, overlay: '', selected: '', selectedSource: '', pendingSettlement: null, pendingImport: null, result: null, storageOK: true, recovery: false, conflict: false });
  saveSession.initialize(); writes = 0;
});
afterEach(() => {
  clearTimeout((toast as any).timer);
  for (const [key, descriptor] of globals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

for (const outcome of ['extract', 'death', 'timeout'] as const) test(`${outcome}: failed settlement stays pending, retry saves exactly once and survives reload`, () => {
  app.loadout = begin();
  D.addItem(app.loadout.bag, 'sample');
  D.addItem(app.loadout.safe, 'pearl');
  saveSession.persist(app.save, initialCheckpoint(generateRun(42), app.loadout));
  app.state = 'run';
  failWrites = true;
  assert.equal(settle(outcome, 2), false);
  assert.equal(app.state, 'run');
  assert.equal(app.result, null);
  assert.equal(app.pendingSettlement?.lastResult?.outcome, outcome);
  assert.ok(JSON.parse(stored!).profile.activeRun);
  assert.equal(app.save.stats.extracts, 0);
  setOverlay('');
  assert.equal(app.overlay, 'save-error', 'Escape cannot hide an unsaved settlement');
  assert.equal(saveSession.prepareSettlement('death', 0), false, 'A staged settlement is never staged again');
  assert.equal(app.pendingSettlement?.lastResult?.outcome, outcome, 'The frozen outcome cannot be overwritten');
  const backup = decodeBackup(encodeBackup(app.pendingSettlement!));
  assert.equal(backup.activeRun, null);
  assert.equal(backup.stats.kills, 2);
  assert.equal(D.count(backup.safe, 'pearl'), 1);
  assert.equal(D.count(backup.bag, 'sample'), outcome === 'extract' ? 1 : 0);
  failWrites = false;
  assert.equal(retrySettlement(), true);
  assert.equal(retrySettlement(), false);
  assert.equal(writes, 3, 'Deployment, the updated checkpoint and one successful settlement were written');
  const reopened = read();
  assert.equal(D.recoverInterrupted(reopened), null);
  assert.equal(reopened.stats.runs, 1);
  assert.equal(reopened.stats.kills, 2);
  assert.equal(reopened.stats.extracts, outcome === 'extract' ? 1 : 0);
  assert.equal(app.state, 'result');
  assert.equal(app.pendingSettlement, null);
});

test('merchant purchases and quest submission roll back cash, items and rewards on storage failure', () => {
  app.save.quests.repair = true; app.save.stats.runs = 3; app.save.stats.extracts = 3;
  D.addItem(app.save.stash, 'sample');
  const original = structuredClone(app.save), pack = D.buyQuantity('ammo9');
  // The tab page's 统一结算 button: checkout() settles the cart inside mutate().
  const checkout: (typeof buttons)[number] = { dataset: { action: 'checkout' } };
  buttons = [checkout]; app.tab = 'arms'; render();
  const cart = app.shop!;
  assert.ok(Shop.moveShopItem(cart, 'merchant', 'buy', cart.catalog.items.find(i => i.id === 'ammo9')!.uid, 0, 0));
  failWrites = true;
  checkout.onclick!();
  assert.deepEqual(app.save, original);
  assert.equal(notification.textContent, '保存失败，物资和进度已恢复到操作前。请检查浏览器存储设置后重试。');
  assert.equal(app.shop, cart, 'the unsaved cart stays for another try');
  assert.equal(mutate(() => D.submitQuest(app.save, 'sample')), false);
  assert.deepEqual(app.save, original);
  failWrites = false;
  checkout.onclick!();
  assert.equal(writes, 1, 'the retried checkout is written once');
  assert.equal(notification.textContent, '交易完成，物资已存入仓库。');
  assert.notEqual(app.shop, cart, 'a committed checkout starts a new cart');
  assert.equal(read().cash, original.cash - pack * D.ITEMS.ammo9.buy);
  assert.equal(D.count(read().stash, 'ammo9'), D.count(original.stash, 'ammo9') + pack);
  const paid = app.save.cash;
  assert.equal(mutate(() => D.submitQuest(app.save, 'sample')), true);
  assert.equal(read().quests.sample, true);
  assert.equal(app.save.cash, paid + D.QUESTS.sample.reward);
});

// In-raid transfers and medical use are Runtime transactions now (raid-runtime.test.ts: ground pickup and medical
// failures, medical commit failure, drop and equip failure); the tab page's own safe transfers still roll back here.
test('failed safe transfers on the tab page restore both inventories', () => {
  D.addItem(app.save.safe, 'medkit');
  const saveBefore = structuredClone(app.save);
  failWrites = true;
  assert.equal(mutate(() => D.transferItem(app.save.safe, app.save.bag, app.save.safe.items[0].uid)), false);
  assert.deepEqual(app.save, saveBefore);
  assert.equal(mutate(() => D.transferItem(app.save.bag, app.save.safe, app.save.bag.items[0].uid)), false);
  assert.deepEqual(app.save, saveBefore);
  failWrites = false;
  assert.equal(mutate(() => D.transferItem(app.save.safe, app.save.bag, app.save.safe.items[0].uid)), true);
  assert.equal(D.count(read().bag, 'medkit'), 1);
});

test('another tab cannot be overwritten by a pending retry; backup remains exportable', () => {
  app.loadout = begin(); app.state = 'run'; failWrites = true;
  assert.equal(settle('extract', 0), false); app.conflict = true; failWrites = false;
  assert.equal(retrySettlement(), false);
  assert.equal(writes, 1, 'Only the deployment commit succeeded');
  assert.equal(decodeBackup(encodeBackup(app.pendingSettlement!)).stats.extracts, 1);
  assert.equal(mutate(() => { app.save.cash = 999; }), false);
});

test('backup import preserves the old save on failure and commits the full new save on success', () => {
  const original = structuredClone(app.save), backup = D.newSave();
  backup.cash = 1234; backup.settings.volume = .2;
  const candidate = decodeBackup(encodeBackup(backup));
  failWrites = true;
  assert.equal(importSave(candidate), false);
  assert.deepEqual(app.save, original);
  failWrites = false;
  assert.equal(importSave(candidate), true);
  assert.deepEqual(read(), candidate);
});

test('a session backup import that cannot be written keeps the dialog and reports the failure', () => {
  saveSession.persist(app.save);
  const record = saveSession.backupRecord()!; record.profile.cash = 4321;
  const candidate = decodePortableBackup(encodeRecoveryBackup(record));
  assert.equal(candidate.kind, 'session');
  const confirm: (typeof buttons)[number] = { dataset: { action: 'confirm-import' } };
  buttons = [confirm]; notification.textContent = '';
  app.pendingRecoveryImport = candidate.kind === 'session' ? candidate.record : null;
  setOverlay('import-save');
  const before = stored, original = structuredClone(app.save);
  failWrites = true;
  confirm.onclick!();
  assert.equal(stored, before);
  assert.deepEqual(app.save, original);
  assert.equal(notification.textContent, '存档保存失败。请检查浏览器是否允许保存数据，然后重试。');
  assert.equal(app.overlay, 'import-save', 'the dialog stays open for another try');
  assert.ok(app.pendingRecoveryImport);
  failWrites = false;
  confirm.onclick!();
  assert.equal(app.pendingRecoveryImport, null);
  assert.equal(app.state, 'menu');
  assert.equal(read().cash, 4321);
});

test('backup reader rejects unrelated, unsupported, truncated, oversized, overlapping and live-raid data', () => {
  for (const text of ['{}', '{', JSON.stringify({ version: 2 }), ' '.repeat(PROFILE_MAX_BYTES + 1)]) assert.throws(() => decodeBackup(text));
  const save = D.newSave();
  save.bag.items[1].x = save.bag.items[0].x; save.bag.items[1].y = save.bag.items[0].y;
  assert.throws(() => decodeBackup(JSON.stringify(save)));
  const live = D.newSave(); D.beginRun(live, 42);
  assert.throws(() => encodeBackup(live));
  assert.throws(() => decodeBackup(JSON.stringify(live)));
  const valid = D.newSave();
  assert.deepEqual(decodeBackup(encodeBackup(valid)), valid);
  assert.deepEqual(decodeBackup(JSON.stringify(valid)), valid, 'Version-one raw saves may be migrated from older HTML files');
});

// Clock seeds are Date.now() >>> 0: above 1e9 for about 38 of every 49.7 days (2026-10-14 18:09 UTC to
// 2026-11-21 17:25 UTC, then again). The settled summary must keep the full 32-bit seed like the active run does.
for (const seed of [1_039_041_854, 0xffffffff]) test(`a run seeded ${seed} settles, reloads and exports`, () => {
  saveSession.beginRun(seed);
  assert.equal(app.save.activeRun?.seed, seed);
  saveSession.persist(app.save, initialCheckpoint(generateRun(seed), app.loadout!));
  app.state = 'run';
  assert.equal(saveSession.prepareSettlement('extract', 0), true);
  assert.equal(retrySettlement(), true);
  assert.equal(app.pendingSettlement, null, 'the settlement was written');
  assert.equal(app.state, 'result');
  const record = JSON.parse(stored!);
  assert.equal(record.profile.lastResult.seed, seed);
  assert.equal(record.profile.activeRun, null);
  assert.equal(decodeSession(stored!).profile.lastResult?.seed, seed, 'the stored record passes the strict reader');
  assert.equal(read().lastResult?.seed, seed);
  assert.equal(decodeBackup(encodeBackup(app.save)).lastResult?.seed, seed);
  assert.doesNotThrow(() => encodeRecoveryBackup(saveSession.backupRecord()!));
  assert.equal(D.migrateSave({ ...D.newSave(), lastResult: { outcome: 'extract', kills: 0, keptValue: 0, lostValue: 0, seed, recovered: false, message: '' } }).lastResult?.seed, seed);
});
