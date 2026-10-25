import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { createSessionState, SaveSession } from '../src/session';
import { RecoveryStore, SESSION_KEY } from '../src/recovery-store';
import { oldProfile } from './fixtures/old-saves';
const read = (storage: D.StorageLike) => new RecoveryStore(storage).load().save;

/** No global storage, document, Phaser, UI mocks or timers are needed here. */
function fixture(raw: string | null = null) {
    const state = createSessionState();
    state.state = 'hideout';
    const data = new Map<string, string>();
    if (raw) data.set(raw.includes('escape-bincov-session') ? SESSION_KEY : D.SAVE_KEY, raw);
    let failWrites = false;
    let writes = 0;
    const storage: D.StorageLike = {
        getItem: key => data.get(key) ?? null,
        setItem: (key, value) => {
            assert.equal(key, SESSION_KEY);
            if (failWrites) throw new Error('quota exceeded');
            data.set(key, value);
            writes++;
        },
    };
    const session = new SaveSession(state, () => storage);
    if (raw === null) { session.initialize(); writes = 0; }
    return {
        state, session, storage,
        snapshot: () => structuredClone(state),
        failWrites(value: boolean) { failWrites = value; },
        get stored() { return data.get(SESSION_KEY) ?? data.get(D.SAVE_KEY) ?? null; },
        get writes() { return writes; },
    };
}

test('sessions isolate progress, storage and pending outcomes', () => {
    const a = fixture(), b = fixture();
    assert.equal(a.session.beginRun(42), true);
    a.state.state = 'run';
    assert.equal(a.session.prepareSettlement('extract', 3), true);
    assert.equal(a.state.pendingSettlement?.stats.kills, 3);
    assert.equal(b.state.pendingSettlement, null);
    assert.equal(b.state.save.activeRun, null);
    assert.equal(b.state.save.stats.runs, 0);
    assert.equal(b.writes, 0);
});

test('a denied storage accessor is handled without publishing a raid loadout', () => {
    const state = createSessionState();
    const session = new SaveSession(state, () => { throw new Error('SecurityError'); });
    assert.equal(session.initialize(), false);
    assert.equal(state.storageOK, false);
    state.state = 'hideout';
    const before = structuredClone(state.save);
    assert.equal(session.beginRun(42), false);
    assert.deepEqual(state.save, before);
    assert.equal(state.loadout, null);
});

test('initialization migrates version-zero but refuses to overwrite malformed saves', () => {
    const old = fixture(JSON.stringify({ version: 0, cash: 1234, inventory: [{ id: 'pearl', quantity: 2 }] }));
    assert.equal(old.session.initialize(), true);
    assert.equal(old.state.save.cash, 1234);
    assert.equal(D.count(old.state.save.stash, 'pearl'), 2);
    assert.equal(read(old.storage).version, 3);
    const corrupt = fixture('{');
    assert.equal(corrupt.session.initialize(), false);
    assert.equal(corrupt.stored, '{');
    assert.equal(corrupt.state.save.cash, 700);
    assert.equal(corrupt.state.recovery, false);
});

test('interrupted recovery survives a failed startup write without duplicating relief', () => {
    const save = D.newSave();
    save.cash = 0; save.stash.items = []; save.bag.items = [];
    D.addItem(save.safe, 'pearl');
    D.beginRun(save, 42);
    const old = oldProfile(save); // the legacy key only ever holds profiles up to v2
    const f = fixture(JSON.stringify(old));
    f.failWrites(true);
    assert.equal(f.session.initialize(), false);
    assert.equal(f.state.recovery, true);
    assert.equal(f.state.save.activeRun, null);
    assert.equal(D.count(f.state.save.safe, 'pearl'), 1);
    assert.equal(D.count(f.state.save.bag, 'ammo9'), 12);
    assert.ok(JSON.parse(f.stored!).activeRun);
    f.failWrites(false);
    assert.equal(f.session.persist(), true);
    const reopened = fixture(f.stored);
    assert.equal(reopened.session.initialize(), true);
    assert.equal(reopened.state.recovery, false);
    assert.equal(D.count(reopened.state.save.bag, 'ammo9'), 12);
    assert.equal(reopened.state.save.stats.runs, 1);
});

test('deployment publishes gear and run count only after storage accepts the candidate', () => {
    const f = fixture();
    const before = structuredClone(f.state.save);
    f.failWrites(true);
    assert.equal(f.session.beginRun(42), false);
    assert.deepEqual(f.state.save, before);
    assert.equal(f.state.loadout, null);
    assert.equal(f.writes, 0);
    const observing = new SaveSession(f.state, () => ({
        ...f.storage,
        setItem(key, value) {
            assert.deepEqual(f.state.save, before, 'UI still sees prepared equipment during the write');
            assert.equal(f.state.loadout, null);
            f.storage.setItem(key, value);
        },
    }));
    f.failWrites(false);
    assert.equal(observing.initialize(), true);
    assert.equal(observing.beginRun(42), true);
    assert.equal(f.state.save.stats.runs, 1);
    const deployed = f.snapshot();
    assert.equal(deployed.loadout?.runId, read(f.storage).activeRun?.runId);
    assert.equal(D.count(deployed.loadout!.bag, 'ammo9') + deployed.loadout!.ammo, D.count(before.bag, 'ammo9'));
    assert.equal(f.state.save.bag.items.length, 0);
    assert.equal(f.writes, 2);
});

test('deployment cannot bypass session state or a cross-window conflict', () => {
    const f = fixture(), before = structuredClone(f.state.save);
    for (const state of ['menu', 'run', 'result'] as const) {
        f.state.state = state;
        assert.equal(f.session.beginRun(42), false);
    }
    f.state.state = 'hideout'; f.state.conflict = true;
    assert.equal(f.session.beginRun(42), false);
    assert.deepEqual(f.state.save, before);
    assert.equal(f.writes, 0);
});

for (const failure of ['reject', 'throw'] as const) test(`a ${failure} after partial mutation restores progress, loadout and every vital`, () => {
    const f = fixture();
    f.session.beginRun(42); f.state.state = 'run';
    const before = structuredClone(f.state.save), carried = structuredClone(f.state.loadout);
    const player = { hp: 15, stamina: 30, pollution: 80, bleeding: 1 };
    const beforeVitals = { ...player };
    const action = () => {
        f.state.save.cash = 0;
        f.state.loadout!.bag.items = [];
        Object.assign(player, { hp: 70, stamina: 90, pollution: 10, bleeding: 0 });
        if (failure === 'throw') throw new Error('domain failure');
        return false;
    };
    if (failure === 'throw') assert.throws(() => f.session.mutate(action, player), /domain failure/);
    else assert.equal(f.session.mutate(action, player), 'rejected');
    assert.deepEqual(f.state.save, before);
    assert.deepEqual(f.state.loadout, carried);
    assert.deepEqual(player, beforeVitals);
    assert.equal(f.writes, 1, 'Only deployment was written');
});

test('a committed safe transfer restores the matching live loadout without duplication', () => {
    const f = fixture();
    D.addItem(f.state.save.safe, 'pearl');
    f.session.beginRun(42); f.state.state = 'run';
    const uid = f.state.loadout!.safe.items[0].uid;
    assert.equal(f.session.mutate(() => D.transferItem(f.state.loadout!.safe, f.state.loadout!.bag, uid)), 'committed');
    const reopened = fixture(f.stored);
    reopened.session.initialize();
    assert.equal(D.count(reopened.state.save.safe, 'pearl'), 0);
    assert.equal(D.count(reopened.state.save.bag, 'pearl'), 0);
    assert.equal(D.count(reopened.state.checkpoint!.loadout.bag, 'pearl'), 1);
});

test('relief and volume writes retain the last durable values on failure', () => {
    const f = fixture();
    f.state.save.cash = 0; f.state.save.stash.items = []; f.state.save.bag.items = [];
    f.state.save.equipment = { weapon: null, weaponUid: null, gun: null, relief: false, ammo: 0, ammoRelief: 0 };
    const before = structuredClone(f.state.save);
    f.failWrites(true);
    assert.equal(f.session.grantRelief(), false);
    assert.deepEqual(f.state.save, before);
    assert.equal(f.session.setVolume(0.8), false);
    assert.equal(f.state.save.settings.volume, before.settings.volume);
    f.failWrites(false);
    assert.equal(f.session.grantRelief(), true);
    assert.equal(f.session.grantRelief(), false);
    assert.equal(f.session.setVolume(0.8), true);
    assert.equal(D.count(read(f.storage).bag, 'ammo9'), 12);
    assert.equal(read(f.storage).settings.volume, 0.8);
    assert.equal(f.writes, 2);
});

test('staging, failed writes and conflict keep one frozen settlement until successful retry', () => {
    const f = fixture();
    f.session.beginRun(42); f.state.state = 'run';
    D.addItem(f.state.loadout!.bag, 'sample');
    assert.equal(f.session.prepareSettlement('extract', 2), true);
    const candidate = f.state.pendingSettlement;
    f.failWrites(true);
    assert.equal(f.session.retrySettlement(), false);
    assert.equal(f.state.result, null);
    assert.ok(read(f.storage).activeRun);
    assert.equal(f.session.prepareSettlement('death', 10), false);
    assert.equal(f.session.mutate(() => { throw new Error('Must never run'); }), 'blocked');
    assert.equal(f.session.setVolume(0.8), false);
    assert.equal(f.session.grantRelief(), false);
    assert.equal(f.session.importSave(D.newSave()), false);
    f.failWrites(false); f.session.markConflict();
    assert.equal(f.state.storageOK, false);
    assert.equal(f.session.retrySettlement(), false);
    assert.equal(f.state.pendingSettlement, candidate);
    assert.equal(f.writes, 1);
    // Only the test removes the conflict; production requires a refresh/import.
    f.state.conflict = false;
    assert.equal(f.session.retrySettlement(), true);
    assert.equal(f.session.retrySettlement(), false);
    assert.equal(f.writes, 2);
    assert.equal(f.snapshot().result?.kills, 2);
    assert.equal(f.state.save.stats.extracts, 1);
    assert.equal(D.count(f.state.save.bag, 'sample'), 1);
    assert.equal(f.state.pendingSettlement, null);
    assert.equal(f.state.loadout, null);
});

test('import commits before replacing state and does not alias its input', () => {
    const f = fixture(), original = structuredClone(f.state.save);
    const candidate = D.newSave(); candidate.cash = 1234;
    f.failWrites(true);
    assert.equal(f.session.importSave(candidate), false);
    assert.deepEqual(f.state.save, original);
    f.failWrites(false);
    f.state.conflict = true;
    assert.equal(f.session.importSave(candidate), false);
    f.state.conflict = false;
    assert.equal(f.session.importSave(candidate), true);
    candidate.cash = 0;
    assert.equal(f.state.save.cash, 1234);
    assert.equal(read(f.storage).cash, 1234);
});
