import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { newExpansion, validateExpansion } from '../src/expansion-state';
import { RecoveryStore, SESSION_KEY, decodeSession } from '../src/recovery-store';
import { createSessionState, SaveSession } from '../src/session';
import { decodePortableBackup, encodeRecoveryBackup } from '../src/save-backup';
import { changeLayer } from '../src/layer-transition';
import { advanceProduction } from '../src/production-clock';
import { prototypeWorld, prototypeRaid, productionBatch } from './fixtures/layered';

function fixture(world = prototypeWorld(), bytes?: string) {
    const data = new Map<string, string>(); if (bytes) data.set(SESSION_KEY, bytes);
    let denied = false, writes = 0;
    const storage: D.StorageLike = { getItem: key => data.get(key) ?? null, setItem: (key, text) => {
        assert.equal(key, SESSION_KEY); if (denied) throw new Error('quota'); data.set(key, text); writes++;
    } };
    const resolve = (id: string) => id === world.id ? world : undefined;
    const state = createSessionState(), session = new SaveSession(state, () => storage, resolve);
    assert.equal(session.initialize(), true); state.state = 'hideout';
    return { world, resolve, state, session, storage, data, deny(value: boolean) { denied = value; }, get writes() { return writes; },
        get bytes() { return data.get(SESSION_KEY)!; } };
}
function deployed() {
    const f = fixture(); assert.equal(f.session.enableExpansion(1000), true);
    const deployment = f.session.prepareExpansionMutation(draft => { prototypeRaid(draft.profile, f.world, draft.expansion); });
    assert.ok(deployment); assert.equal(f.session.commitExpansionMutation(deployment), 'committed'); f.state.state = 'run';
    return f;
}

test('v4 activation is atomic, retains exact pre-upgrade bytes once, and preserves coast snapshots', () => {
    const f = fixture(); assert.equal(f.session.beginRun(42), true); f.state.state = 'run';
    f.state.checkpoint!.hp = 37; f.state.checkpoint!.stamina = 15; f.state.checkpoint!.pollution = 63; f.state.checkpoint!.bleeding = 1;
    assert.equal(f.session.persist(), true);
    const bytes = f.bytes, original = structuredClone(f.state.checkpoint), profile = structuredClone(f.state.save);
    f.deny(true); assert.equal(f.session.enableExpansion(2000), false);
    assert.equal(f.bytes, bytes); assert.equal(f.state.expansion, null); assert.deepEqual(f.state.checkpoint, original);
    f.deny(false); assert.equal(f.session.enableExpansion(2000), true);
    const record = decodeSession(f.bytes);
    assert.equal(record.version, 8); assert.equal(record.expansion!.version, 1); assert.equal(record.systemsBackup, bytes);
    assert.deepEqual(record.profile, profile); assert.deepEqual(record.raid, original);
    assert.equal(record.expansion!.body.hp, 37); assert.equal(record.expansion!.body.stamina, 15);
    assert.equal(record.expansion!.body.pollution, 63); assert.equal(record.expansion!.body.bleeding, true);
    assert.equal(f.session.persist(), true); assert.equal(decodeSession(f.bytes).systemsBackup, bytes);
    assert.deepEqual(decodeSession(f.bytes).raid, original, 'Upgrade neither regenerates a coast world nor rerolls its loot');
});

test('candidate transition commits shots, one corpse, damage training, pursuit, RNG and production together', () => {
    const f = deployed(), before = structuredClone(f.state.expansion), bytes = f.bytes, profile = structuredClone(f.state.save);
    const ticket = f.session.prepareExpansionMutation(draft => {
        assert.equal(changeLayer(draft.expansion, f.world, 'up'), true);
        advanceProduction(draft.expansion.base, 11000);
    });
    assert.ok(ticket); assert.deepEqual(f.state.expansion, before, 'Preparing a candidate is invisible to the live state');
    f.deny(true); assert.equal(f.session.commitExpansionMutation(ticket), 'save-failed');
    assert.equal(f.bytes, bytes); assert.deepEqual(f.state.expansion, before); assert.deepEqual(f.state.save, profile);
    f.deny(false); assert.equal(f.session.commitExpansionMutation(ticket), 'committed');
    const after = f.state.expansion!, raid = after.raid!;
    assert.equal(raid.currentMap, 'upstairs'); assert.equal(raid.kills, 1); assert.equal(raid.maps.downstairs.bullets.length, 0);
    assert.equal(raid.maps.downstairs.containers.length, 1); assert.equal(raid.training.quantity.technique, 10 / 400);
    assert.equal(raid.pursuits.length, 1); assert.equal(raid.pursuits[0].enemy.uid, 'enemy-1');
    assert.equal(raid.pursuits[0].targetMap, 'upstairs'); assert.ok(raid.pursuits[0].arrivalAt >= 1);
    assert.notEqual(raid.rng, before!.raid!.rng); assert.equal(after.body.hp, before!.body.hp, 'Source enemy bullet cannot hit the departed player');
    assert.equal(after.base.queue[0].remaining, 590); assert.equal(after.base.cursor, 11000);
    assert.equal(raid.elapsed, 0); assert.equal(raid.maps.downstairs.localTime, 0);
    assert.equal(raid.reloadLeft, .8); assert.equal(raid.fireCooldown, .2);
    assert.equal(f.session.commitExpansionMutation(ticket), 'rejected');
    const reopened = fixture(f.world, f.bytes); assert.deepEqual(reopened.state.expansion, after);
    const nextA = D.seededRandom(raid.rng), nextB = D.seededRandom(reopened.state.expansion!.raid!.rng);
    assert.deepEqual(Array.from({ length: 10 }, nextA), Array.from({ length: 10 }, nextB));
    const returnTicket = reopened.session.prepareExpansionMutation(draft => changeLayer(draft.expansion, f.world, 'down'));
    assert.ok(returnTicket); assert.equal(reopened.session.commitExpansionMutation(returnTicket), 'committed');
    assert.equal(reopened.state.expansion!.raid!.maps.downstairs.containers.length, 1);
    assert.equal(reopened.state.expansion!.raid!.kills, 1);
});

test('stale candidates cannot overwrite a newer commit, and foreign tickets cannot be used', () => {
    const f = deployed(), ticket = f.session.prepareExpansionMutation(d => { advanceProduction(d.expansion.base, 2000); });
    assert.ok(ticket); assert.equal(f.session.setVolume(.75), true);
    const current = f.bytes; assert.equal(f.session.commitExpansionMutation(ticket), 'rejected'); assert.equal(f.bytes, current);
    const other = fixture(f.world, f.bytes); assert.equal(other.session.commitExpansionMutation(ticket), 'rejected');
    const fresh = f.session.prepareExpansionMutation(d => { advanceProduction(d.expansion.base, 2000); }); assert.ok(fresh);
    const peerState = createSessionState(), peer = new SaveSession(peerState, () => f.storage, f.resolve);
    assert.equal(peer.initialize(), true); assert.equal(peer.setVolume(.2), true);
    assert.equal(f.session.commitExpansionMutation(fresh), 'save-failed');
    assert.equal(decodeSession(f.bytes, f.resolve).profile.settings.volume, .2);
});

test('strict imports reject corruption without changing stored bytes or silently resetting the world', () => {
    const f = deployed(), valid = f.bytes;
    const faults: ((r: any) => void)[] = [
        r => { r.version = 3; }, r => { delete r.expansion; }, r => { delete r.systemsBackup; },
        r => { r.expansion.version = 9; }, r => { r.expansion.body.hp = 101; },
        r => { r.expansion.body.effects.technique = 181; }, r => { r.expansion.growth.progress.strength = 1; },
        r => { r.expansion.growth.permanent.strength = 30; r.expansion.growth.progress.strength = .1; },
        r => { r.expansion.growth.reputation.test = 101; }, r => { r.expansion.base.queue[0].result[0].qty = 3; },
        r => { r.expansion.base.queue[0].duration = 1; }, r => { r.expansion.base.queue[0].paidCash = 0; },
        r => { r.expansion.base.nextBatch = 1; }, r => { r.expansion.base.cursor = -1; },
        r => { r.expansion.raid.worldVersion = 'unknown-v1'; }, r => { r.expansion.raid.layoutRevision = 'old'; },
        r => { r.expansion.raid.player.x = 200; }, r => { r.expansion.raid.maps.upstairs.loot.push({ uid: 'loot-1', id: 'food', qty: 1, relief: false, x: 400, y: 48 }); },
        r => { r.expansion.raid.maps.upstairs.bullets = r.expansion.raid.maps.downstairs.bullets; },
        r => { r.expansion.raid.maps.downstairs.enemies.push(r.expansion.raid.maps.downstairs.enemies[0]); },
        r => { r.expansion.raid.kills = 1; }, r => { r.expansion.raid.elapsed = 300; },
        r => { r.expansion.raid.nextEntity = 1; r.expansion.raid.maps.downstairs.bullets[0].uid = 'entity-1'; },
        r => { r.expansion.body.futureBody = 1; }, r => { delete r.expansion.raid.training; }, r => { r.futureClock = 1; },
        r => { r.expansion.raid.player.x = 160; }, r => { r.expansion.raid.maps.downstairs.enemies[0].x = 176; },
    ];
    for (const mutate of faults) {
        const record = JSON.parse(valid); mutate(record); const corrupt = JSON.stringify(record); f.data.set(SESSION_KEY, corrupt);
        assert.throws(() => new RecoveryStore(f.storage, () => 1234, f.resolve).load()); assert.equal(f.bytes, corrupt);
    }
    f.data.set(SESSION_KEY, valid);
    assert.throws(() => decodeSession(valid), /损坏|兼容/, 'Prototype data is not accepted by the normal game without its explicit resolver');
});

test('expanded settled/live/pending backups preserve growth and queues; imports replace complete state', () => {
    const f = deployed(); f.state.expansion!.growth.progress.technique = .2; f.state.expansion!.body.hp = 37;
    const futureCursor = Date.now() + 60_000;
    f.state.expansion!.base.cursor = futureCursor;
    assert.equal(f.session.persist(), true);
    const portable = decodePortableBackup(encodeRecoveryBackup(f.session.backupRecord()!, f.resolve), f.resolve);
    assert.equal(portable.kind, 'session'); if (portable.kind !== 'session') return;
    const target = fixture(); assert.equal(target.session.importRecord(portable.record), true);
    assert.deepEqual(target.state.expansion, f.state.expansion);
    assert.equal(f.session.prepareSettlement('abandon', 0), true);
    assert.equal(f.state.pendingExpansion!.base.cursor, futureCursor, 'Clock rollback cannot lower the cursor while preparing settlement');
    const pending = structuredClone(f.state.pendingExpansion); f.deny(true);
    assert.equal(f.session.retrySettlement(), false); assert.deepEqual(f.state.pendingExpansion, pending);
    assert.equal(f.state.expansion!.raid!.currentMap, 'downstairs'); assert.equal(f.state.result, null);
    const backup = decodePortableBackup(encodeRecoveryBackup(f.session.backupRecord()!, f.resolve), f.resolve);
    assert.equal(backup.kind, 'session'); if (backup.kind !== 'session') return;
    assert.equal(backup.record.terminal!.reason, 'abandon'); assert.equal(backup.record.expansion!.base.location, 'settlement');
    assert.equal(backup.record.expansion!.growth.progress.technique, .2);
    f.deny(false); assert.equal(f.session.retrySettlement(), true); assert.equal(f.session.retrySettlement(), false);
    assert.equal(f.state.expansion!.body.hp, 37, 'M0 retains the actual abandon body; death-body rules arrive in M3/M5');
    assert.equal(f.state.expansion!.base.location, 'base'); assert.equal(f.state.expansion!.raid, null);
    assert.equal(f.state.expansion!.base.cursor, futureCursor, 'Retry preserves the monotonic cursor');
    f.state.state = 'hideout';
    const settled = f.session.backupRecord()!, settledBytes = f.bytes;
    assert.equal(f.session.importSave(D.newSave()), false); assert.equal(f.bytes, settledBytes, 'Profile-only imports cannot erase v4 fields');
    assert.equal(f.session.importRecord(settled), true); assert.equal(f.session.importRecord(settled), true);
    assert.equal(f.state.save.stats.runs, 1); assert.equal(f.state.expansion!.growth.progress.technique, .2);
    assert.equal(f.session.importRecord(backup.record), true);
    assert.equal(f.state.expansion!.base.cursor, futureCursor, 'Importing pending results must not regress the cursor');
    const importedPending = fixture(f.world, JSON.stringify(backup.record));
    assert.equal(importedPending.state.expansion!.base.location, 'base');
    assert.ok(importedPending.state.expansion!.base.cursor >= backup.record.expansion!.base.cursor);
});

test('dynamic caps and each independent map size are validated rather than using coast constants', () => {
    const world = prototypeWorld(), profile = D.newSave(), state = prototypeRaid(profile, world);
    state.growth.permanent.constitution = 20; state.body.hp = 130;
    state.body.effects.strength = 180; state.body.stamina = 110;
    state.raid!.currentMap = 'upstairs'; state.raid!.player.x = 272; state.raid!.player.y = 200;
    state.raid!.maps.downstairs.bullets = [];
    assert.deepEqual(validateExpansion(state, profile, null, id => id === world.id ? world : undefined), state);
    state.body.hp = 131; assert.throws(() => validateExpansion(state, profile, null, () => world));
});

test('production discards blocked time, never exceeds three completed batches and is monotonic', () => {
    const base = newExpansion(1000).base; base.facilities.workbench = 3;
    base.queue = [productionBatch('batch-4'), productionBatch('batch-5'), productionBatch('batch-6')]; base.nextBatch = 7;
    base.completed = ['batch-1', 'batch-2', 'batch-3'].map(id => ({ ...productionBatch(id), remaining: 0 }));
    advanceProduction(base, 1_000_000_001_000);
    assert.equal(base.queue[0].remaining, 0); assert.equal(base.queue[1].remaining, 600); assert.equal(base.completed.length, 3);
    base.completed.shift(); advanceProduction(base, base.cursor);
    assert.equal(base.completed.length, 3); assert.equal(base.queue[0].id, 'batch-5'); assert.equal(base.queue[0].remaining, 600);
    const before = structuredClone(base); advanceProduction(base, 0); assert.deepEqual(base, before);
    assert.throws(() => advanceProduction(base, NaN));
});
