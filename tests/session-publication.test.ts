import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { createSessionState, SaveSession } from '../src/session';
import { RecoveryStore, SESSION_KEY } from '../src/recovery-store';
import { CoastRaidRuntime, emptyIntent } from '../src/raid-runtime/runtime';
import { RealHideoutRuntime } from '../src/hideout-runtime/runtime';
import { decodePortableBackup, encodeRecoveryBackup } from '../src/save-backup';

function fixture() {
    const data = new Map<string, string>();
    let writes = 0, fail = false;
    const storage = { getItem: (k: string) => data.get(k) ?? null,
        setItem(k: string, v: string) { if (fail) throw new Error('quota'); data.set(k, v); writes++; } };
    const state = createSessionState(); state.state = 'hideout';
    const saves = new SaveSession(state, () => storage, undefined, () => 1000);
    assert.equal(saves.initialize(), true);
    assert.equal(saves.enableRpg(), true);
    return { state, saves, storage, data, get writes() { return writes; }, set fail(v: boolean) { fail = v; },
        stored: () => JSON.parse(data.get(SESSION_KEY)!),
        fault() {
            const live = structuredClone(state.expansion!); let restores = 0;
            saves.attachExpansion({ capture: () => structuredClone(live), restore(value) {
                value.body.hp = 0; // A faulty port cannot corrupt the retained publication/export.
                if (++restores === 1) throw new Error('injected restore failure');
            } });
            return () => restores;
        },
    };
}
function stopped(f: ReturnType<typeof fixture>, writes: number) {
    const record = f.stored();
    assert.equal(f.saves.requiresReload, true);
    assert.equal(f.state.storageFailure, 'publish');
    assert.equal(f.state.storageOK, false);
    assert.equal(f.state.conflict, false, 'publication fault is not an ownership conflict');
    assert.match(f.state.storageError, /已保存/);
    assert.deepEqual(f.saves.backupRecord(), record);
    assert.equal(f.saves.persist(), false);
    assert.equal(f.saves.setVolume(.2), false);
    assert.equal(f.saves.mutate(() => { throw new Error('must not replay'); }), 'blocked');
    assert.equal(f.saves.prepareExpansionMutation(() => { throw new Error('must not prepare'); }), null);
    assert.equal(f.saves.initialize(), false);
    assert.equal(f.writes, writes);
    assert.deepEqual(new RecoveryStore(f.storage).load().save, record.profile);
    const fresh = createSessionState(), saves = new SaveSession(fresh, () => f.storage, undefined, () => 1000);
    assert.equal(saves.initialize(), true);
    assert.deepEqual(fresh.save, record.profile);
}

test('post-write mutation fault keeps durable cash instead of rolling 680 back to 700', () => {
    const f = fixture(), before = f.writes, cash = f.state.save.cash - 20, restores = f.fault();
    assert.equal(f.saves.mutate(() => { f.state.save.cash -= 20; }), 'publish-failed');
    assert.equal(f.state.save.cash, cash);
    assert.equal(f.stored().profile.cash, cash);
    assert.equal(restores(), 1, 'no rollback restore after a successful write');
    stopped(f, before + 1);
});

test('checkpoint publication fault preserves exact world and gear export and freezes Runtime', () => {
    const f = fixture(); assert.equal(f.saves.beginRun(42, true), true); f.state.state = 'run';
    const rt = new CoastRaidRuntime(f.state, f.saves, false), before = f.writes;
    const original = rt.restoreExpansion.bind(rt);
    rt.restoreExpansion = value => { original(value); throw new Error('runtime restore fault'); };
    assert.equal(rt.checkpoint(), false);
    assert.equal(rt.paused, true);
    assert.equal(rt.retrySave(), false);
    const elapsed = rt.elapsed;
    assert.equal(rt.resume(), undefined);
    rt.lootContext = { containerId: 'vanished', runId: f.state.loadout!.runId! };
    for (const now of [1000, 2000, 3000]) { rt.advance(now, emptyIntent()); assert.equal(rt.overlay, 'checkpoint-error'); }
    assert.equal(rt.elapsed, elapsed);
    assert.deepEqual(f.saves.backupRecord(), f.stored());
    stopped(f, before + 1);
});

test('deferred candidate is written once, consumed on publication failure and never replayed', () => {
    const f = fixture(), ticket = f.saves.prepareExpansionMutation(d => { d.profile.cash -= 30; })!;
    f.fail = true;
    assert.equal(f.saves.commitExpansionMutation(ticket), 'save-failed'); f.saves.retainExpansionTransaction(ticket);
    assert.equal(f.saves.backupRecord()!.profile.cash, 670);
    f.fail = false; const before = f.writes, restores = f.fault();
    assert.equal(f.saves.commitExpansionMutation(ticket), 'publish-failed');
    assert.equal(f.saves.commitExpansionMutation(ticket), 'blocked');
    assert.equal(f.state.save.cash, 670); assert.equal(restores(), 1);
    stopped(f, before + 1);
});

test('normal expansion publication restores its port exactly once', () => {
    const f = fixture(), live = structuredClone(f.state.expansion!); let restores = 0;
    f.saves.attachExpansion({ capture: () => structuredClone(live), restore() { restores++; } });
    const ticket = f.saves.prepareExpansionMutation(d => { d.profile.cash--; })!;
    assert.equal(f.saves.commitExpansionMutation(ticket), 'committed'); assert.equal(restores, 1);
    assert.equal(f.saves.commitExpansionMutation(ticket), 'rejected');
});

test('terminal publication fault keeps pending settlement but exports the durable terminal without duplicate rewards', () => {
    const f = fixture(); f.saves.beginRun(42, true); f.state.state = 'run';
    D.addItem(f.state.loadout!.bag, 'sample');
    assert.equal(f.saves.prepareSettlement('extract', 2), true);
    const pending = f.state.pendingSettlement!, before = f.writes; f.fault();
    assert.equal(f.saves.retrySettlement(), false);
    assert.equal(f.state.pendingSettlement, pending);
    assert.equal(f.state.result, null, 'do not claim the page finished publishing');
    assert.equal(f.stored().profile.stats.extracts, 1);
    assert.equal(f.stored().terminal.outcome, 'extract');
    assert.equal(f.saves.retrySettlement(), false);
    assert.equal(f.saves.prepareSettlement('extract', 2), false);
    stopped(f, before + 1);
});

test('import and deployment faults retain the committed candidate rather than inviting replacement', () => {
    for (const action of ['import', 'deploy'] as const) {
        const f = fixture(), record = f.saves.currentRecord()!, before = f.writes; record.profile.cash = 1234;
        f.fault();
        assert.equal(action === 'import' ? f.saves.importRecord(record) : f.saves.beginRun(42, true), false);
        assert.equal(f.state.save.cash, action === 'import' ? 1234 : 700);
        assert.equal(f.saves.beginRun(43, true), false);
        stopped(f, before + 1);
    }
});

test('classic-port failure after expansion transaction is also durable and cannot mutate stored backup', () => {
    const f = fixture(); f.saves.beginRun(42); f.state.state = 'run';
    const checkpoint = structuredClone(f.state.checkpoint!);
    f.saves.attachRaid({ capture: () => structuredClone(checkpoint), restore(c) { c.hp = 0; throw new Error('classic restore'); } });
    const ticket = f.saves.prepareExpansionMutation(d => { d.profile.cash--; })!, before = f.writes;
    assert.equal(f.saves.commitExpansionMutation(ticket), 'publish-failed');
    assert.equal(f.state.save.cash, 699);
    assert.notEqual(f.saves.backupRecord()!.raid!.hp, 0);
    stopped(f, before + 1);
});

test('base retry/export cannot retain or overwrite an already committed candidate', () => {
    const f = fixture(), rt = new RealHideoutRuntime(f.state, f.saves, () => 1000);
    const events: string[] = []; rt.subscribe(e => events.push(e.type));
    f.fault(); const before = f.writes;
    const ticket = f.saves.prepareExpansionMutation(d => { d.profile.cash -= 10; })!;
    assert.equal(f.saves.commitExpansionMutation(ticket), 'publish-failed');
    assert.equal(rt.snapshot().storage.reloadRequired, true);
    assert.equal(rt.retrySave().ok, false);
    assert.equal(events.includes('committed'), false, 'revision change after failed publication must not emit success');
    const backup = decodePortableBackup(rt.exportBackup());
    assert.ok('record' in backup); assert.deepEqual(backup.record, f.stored());
    stopped(f, before + 1);
});

test('capture/validation and storage failures are distinct and leave bytes and revision unchanged', () => {
    const f = fixture(), raw = f.data.get(SESSION_KEY), revision = f.saves.revision;
    f.saves.attachExpansion({ capture() { throw new Error('capture fault'); }, restore() {} });
    assert.equal(f.saves.persist(), false); assert.equal(f.state.storageFailure, 'prepare');
    f.saves.attachExpansion(null);
    const invalid = structuredClone(f.state.expansion!); invalid.body.hp = -10;
    assert.equal(f.saves.persist(f.state.save, null, undefined, invalid), false); assert.equal(f.state.storageFailure, 'prepare');
    f.fail = true; assert.equal(f.saves.persist(), false); assert.equal(f.state.storageFailure, 'storage');
    assert.equal(f.saves.revision, revision); assert.equal(f.data.get(SESSION_KEY), raw); assert.equal(f.saves.requiresReload, false);
    f.fail = false; assert.equal(f.saves.persist(), true); assert.equal(f.state.storageFailure, null);
    f.data.set(SESSION_KEY, raw!);
    assert.equal(f.saves.persist(), false); assert.equal(f.state.conflict, true); assert.equal(f.saves.requiresReload, false);
});

 test('terminal Runtime remains renderable after committed publication failure with an open loot context', () => {
    const f = fixture(); f.saves.beginRun(42, true); f.state.state = 'run';
    const rt = new CoastRaidRuntime(f.state, f.saves, false), before = f.writes;
    rt.lootContext = { containerId: 'vanished', runId: f.state.loadout!.runId! };
    const original = rt.restoreExpansion.bind(rt);
    rt.restoreExpansion = value => { original(value); throw new Error('terminal restore fault'); };
    rt.finish('abandon');
    assert.equal(f.state.save.activeRun, null); assert.ok(f.state.pendingSettlement);
    assert.equal(rt.settlement.retryable, false); assert.equal(rt.settlement.committed, false);
    for (const now of [1000, 2000]) { rt.advance(now, emptyIntent()); assert.equal(rt.overlay, 'checkpoint-error'); }
    assert.equal(rt.retrySettlement(), false); assert.equal(rt.retrySave(), false);
    assert.deepEqual(f.saves.backupRecord(), f.stored()); assert.equal(f.writes, before + 1);
});

test('RecoveryStore performs no fallible clone after the accepted write', () => {
    let stored: string | null = null, wrote = false;
    const store = new RecoveryStore({ getItem: () => stored, setItem: (_k, value) => { stored = value; wrote = true; } });
    const loaded = store.load(), clone = globalThis.structuredClone;
    globalThis.structuredClone = value => { if (wrote) throw new Error('post-write clone'); return clone(value); };
    try {
        const committed = store.commit(loaded.save, null);
        assert.equal(committed.revision, 1); assert.equal(wrote, true);
        committed.profile.cash = 0;
        assert.equal(store.record!.profile.cash, 700, 'return value does not alias store authority');
    } finally { globalThis.structuredClone = clone; }
});

test('successful expansion transaction publishes the committed safe-box projection', () => {
    const f = fixture(); f.saves.beginRun(42, true); f.state.state = 'run';
    const ticket = f.saves.prepareExpansionMutation(d => {
        D.addItem(d.expansion.raid!.loadout.safe, 'pearl');
    })!;
    assert.equal(f.saves.commitExpansionMutation(ticket), 'committed');
    assert.deepEqual(f.state.save.safe, f.stored().profile.safe);
    assert.deepEqual(f.state.save.safe, f.state.loadout!.safe);
    assert.equal(D.count(f.state.save.safe, 'pearl'), 1);
});

test('a one-shot base clock fault after commit stops later transactions without a second write', () => {
    const f = fixture(); let clockFault = false;
    const rt = new RealHideoutRuntime(f.state, f.saves, () => { if (clockFault) { clockFault = false; throw new Error('clock after commit'); } return 1000; });
    const write = f.storage.setItem; f.storage.setItem = (k, v) => { write(k, v); clockFault = true; };
    const before = f.writes;
    assert.equal(rt.setVolume(.4).ok, false);
    assert.equal(f.stored().profile.settings.volume, .4);
    assert.equal(f.saves.requiresReload, true);
    assert.equal(rt.setVolume(.5).ok, false);
    assert.equal(rt.retrySave().ok, false); assert.equal(f.writes, before + 1);
    assert.deepEqual(f.saves.backupRecord(), f.stored());
});

test('later rolled-back mutation cannot contaminate the retained publication used by external sync failure', () => {
    const f = fixture(), rt = new RealHideoutRuntime(f.state, f.saves, () => 1000);
    const ticket = f.saves.prepareExpansionMutation(d => { d.profile.cash -= 10; })!;
    assert.equal(f.saves.commitExpansionMutation(ticket), 'committed');
    const committed = f.stored();
    f.fail = true;
    assert.equal(f.saves.mutate(() => { f.state.save.cash -= 50; }), 'save-failed');
    f.fail = false;
    const capture = f.saves.captureExpansion.bind(f.saves); let broken = true;
    f.saves.captureExpansion = () => { if (broken) { broken = false; throw new Error('external sync fault'); } return capture(); };
    rt.snapshot();
    assert.equal(f.saves.requiresReload, true);
    assert.deepEqual(f.state.save, committed.profile);
    assert.deepEqual(f.saves.captureExpansion(), committed.expansion);
    assert.deepEqual(f.saves.backupRecord(), committed);
});

for (const operation of ['transaction', 'retry', 'import', 'deploy'] as const) test(`base ${operation} sync fault uses the exact durable record and disallows a second write`, () => {
    const f = fixture(), rt = new RealHideoutRuntime(f.state, f.saves, () => 1000);
    const text = encodeRecoveryBackup(f.saves.currentRecord()!), preview = rt.previewImport(text);
    assert.ok(preview.ok && preview.token);
    const before = f.writes, capture = f.saves.captureExpansion.bind(f.saves); let fired = false;
    f.saves.captureExpansion = () => { if (f.writes > before && !fired) { fired = true; throw new Error('post-commit sync capture'); } return capture(); };
    const result = operation === 'transaction' ? rt.setVolume(.4) : operation === 'retry' ? rt.retrySave()
        : operation === 'import' ? rt.importBackup(text, preview.token!) : rt.deploy({ world: 'buildings', seed: '42' });
    assert.equal(fired, true); assert.equal(result.ok, false); assert.equal(f.saves.requiresReload, true);
    assert.equal(rt.retrySave().ok, false); assert.equal(rt.setVolume(.5).ok, false);
    assert.equal(f.writes, before + 1); assert.deepEqual(f.saves.backupRecord(), f.stored());
});

test('a storage conflict takes precedence over a later publication callback and preserves the pending backup', () => {
    const f = fixture(); f.saves.beginRun(42, true); f.state.state = 'run'; f.saves.prepareSettlement('extract', 1);
    const pending = f.saves.backupRecord(); f.saves.markConflict();
    assert.equal(f.saves.publishCommitted(() => { throw new Error('must not run after conflict'); }), false);
    assert.equal(f.saves.requiresReload, false); assert.equal(f.state.conflict, true);
    assert.deepEqual(f.saves.backupRecord(), pending);
});
