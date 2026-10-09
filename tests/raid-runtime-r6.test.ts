import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionState, SaveSession } from '../src/session';
import { SESSION_KEY, decodeSession } from '../src/recovery-store';
import { CoastRaidRuntime, emptyIntent } from '../src/raid-runtime/runtime';
import { wrapCoastRuntime } from '../src/raid-runtime/host';
import { createRuntimeTestDriver } from '../src/raid-runtime/test-support';
import { checkpointBodyFits, traversable } from '../src/spatial';
import { advanceRaidBody } from '../src/rpg';
import { entityUid } from '../src/expansion-state';
import type { EndReason } from '../src/expansion-state';

function fixture(layered = true) {
    const state = createSessionState(), data = new Map<string, string>(); let fail = false, writes = 0;
    const saves = new SaveSession(state, () => ({ getItem: k => data.get(k) ?? null, setItem: (k, v) => { writes++; if (fail) throw Error('R6 quota'); data.set(k, v); } }));
    assert.ok(saves.initialize()); state.state = 'hideout'; assert.ok(saves.beginRun(42, layered)); state.state = 'run';
    const runtime = new CoastRaidRuntime(state, saves); runtime.freezeAI = true;
    const host = wrapCoastRuntime(runtime, state, saves), driver = createRuntimeTestDriver(runtime, '?test=1');
    return { state, data, saves, runtime, host, driver, fail(v: boolean) { fail = v; }, get writes() { return writes; } };
}

test('R6-L1 four reasons survive failed commit, backup and exact retry without changing outcome or legacy schema', () => {
    for (const layered of [false, true]) for (const reason of ['extract', 'death', 'timeout', 'abandon'] as EndReason[]) {
        const f = fixture(layered), r = f.runtime, before = f.data.get(SESSION_KEY);
        assert.equal(f.host.services.settlement().reason, null);
        f.fail(true); r.finish(reason);
        assert.equal(f.data.get(SESSION_KEY), before);
        assert.deepEqual([r.settlement.reason, r.settlement.committed, r.settlement.retryable], [reason, false, true]);
        const backup = decodeSession(JSON.stringify(f.saves.backupRecord()));
        assert.equal(backup.terminal?.reason, layered ? reason : undefined);
        const candidate = structuredClone(f.state.pendingSettlement); r.finish('extract');
        assert.deepEqual(f.state.pendingSettlement, candidate); assert.equal(r.settlement.reason, reason);
        assert.throws(() => r.dispose(), /Settlement/);
        f.fail(false); assert.ok(r.retrySettlement());
        const stored = decodeSession(f.data.get(SESSION_KEY)!);
        assert.equal(stored.terminal?.outcome, reason === 'abandon' ? 'death' : reason);
        assert.equal(stored.terminal?.reason, layered ? reason : undefined);
        assert.equal(r.settlement.reason, reason); const writes = f.writes;
        assert.equal(r.retrySettlement(), false); assert.equal(f.writes, writes);
        // Existing records without reason remain valid; no inferred distinction between death and abandon.
        const old = structuredClone(stored); if (old.terminal) delete old.terminal.reason;
        assert.doesNotThrow(() => decodeSession(JSON.stringify(old))); r.dispose();
    }
});

test('R6-L2 sustained causes and low damage blows are explicit without extra RNG or HP loss', () => {
    for (const layered of [false, true]) for (const cause of ['bleed', 'pollution'] as const) {
        const f = fixture(layered), r = f.runtime;
        if (layered) { const s = r.snapshotExpansion(); s.body.bleeding = cause === 'bleed'; s.body.pollution = cause === 'pollution' ? 90 : 0; r.restoreExpansion(s); }
        else { const s = r.snapshot(); s.bleeding = cause === 'bleed' ? 1 : 0; s.pollution = cause === 'pollution' ? 90 : 0; r.restore(s); }
        r.advance(0, emptyIntent()); const hp = r.hp, rng = r.snapshot().rng;
        const b = r.advance(125, emptyIntent()), hurt = b.events.filter(e => e.type === 'hurt');
        assert.ok(hurt.length); assert.ok(hurt.every(e => e.type === 'hurt' && e.cause === cause && e.angle === null));
        assert.ok(Math.abs(hurt.reduce((n, e) => n + (e.type === 'hurt' ? e.damage : 0), 0) - (hp - r.hp)) < 1e-10);
        assert.equal(r.snapshot().rng, rng);
        r.hurt(.25); assert.ok(r.current().events.some(e => e.type === 'hurt' && e.cause === 'blow' && e.damage < 1));
    }
});

test('R6-L2 mixed lethal RPG loss is observable without changing the shared calculation', () => {
    const f = fixture(), s = f.runtime.snapshotExpansion(); Object.assign(s.body, { hp: .1, bleeding: true, pollution: 90, water: 0, satiety: 0 });
    const observed = structuredClone(s), original = structuredClone(s); let loss: Record<string, number> = {};
    assert.equal(advanceRaidBody(observed, .125, false, 1, false, v => { loss = v; }), advanceRaidBody(original, .125, false, 1, false));
    assert.deepEqual(observed, original); assert.ok(Math.abs(Object.values(loss).reduce((a,b) => a+b,0)-.1)<1e-12);
    for (const key of ['bleed', 'pollution', 'dehydration', 'starvation']) assert.ok(loss[key] > 0);
});

test('R6-L3 impact ownership survives readback and missing legacy enemy owner remains unknown', () => {
    for (const layered of [false, true]) for (const owner of ['player', 'enemy-0', null]) {
        const f = fixture(layered), r = f.runtime, s = r.snapshot();
        s.bullets = [{ uid: layered ? entityUid({version: 2, runId: s.runId}, s.nextEntity++) : `entity-${s.nextEntity++}`, x: s.player.x, y: s.player.y, rotation: 0, vx: 100, vy: 0, damage: 1, left: .1,
            enemy: owner !== 'player', ...(owner && owner !== 'player' ? { owner } : {}) }];
        // Respect the allocator in the candidate snapshot.
        r.restore(s);
        assert.equal(r.current().frame.bullets[0].owner, owner);
        r.updateBullets(.02); const impact = r.current().events.find(e => e.type === 'impact');
        assert.ok(impact?.type === 'impact'); assert.equal(impact.owner, owner);
    }
});

test('R6-L4 flooded indices follow current tide/map and remain detached across reload and layer changes', () => {
    for (const high of [false, true]) {
        const f = fixture(), r = f.runtime, s = r.snapshotExpansion(), raid = s.raid!;
        raid.highTide = high; raid.tideChanged = high !== raid.initialHigh; raid.elapsed = raid.tideChanged ? 300 : 0; raid.warned = raid.tideChanged;
        r.restoreExpansion(s);
        for (const mapId of ['coast', 'resident-f2', 'resident-b1']) {
            const def = r.layeredWorld!.maps[mapId], layer = r.layered!.raid!.maps[mapId];
            let p: {x:number;y:number} | undefined;
            for (let y=0;y<def.cells.length&&!p;y++) for(let x=0;x<def.cells[y].length&&!p;x++) {
                const q={x:x*32+16,y:y*32+16}; if(checkpointBodyFits({definition:def,doors:layer.doors,highTide:high},q))p=q;
            }
            f.driver.placePlayer(p!,0,mapId); const b = r.current();
            const expected = b.map.cells.flatMap((row,y) => row.flatMap((cell,x) => cell==='tide' && high && !def.doors.some(d=>d.x===x&&d.y===y) ? [y*b.map.cols+x] : []));
            assert.deepEqual(b.frame.flooded,expected); if(mapId==='coast'&&high)assert.ok(expected.length);
            for(const i of expected) assert.equal(traversable({...r.space!,highTide:true},{x:(i%b.map.cols)*32+16,y:Math.floor(i/b.map.cols)*32+16},'body',0),false);
            assert.ok(Object.isFrozen(b.frame.flooded)); const snapshot=r.snapshotExpansion();r.restoreExpansion(snapshot);
            assert.deepEqual(r.current().frame.flooded,expected);assert.deepEqual(b.frame.flooded,expected);
        }
    }
    const f=fixture(),r=f.runtime,s=r.snapshotExpansion();s.raid!.elapsed=299.99;s.raid!.warned=true;
    r.restoreExpansion(s);r.advance(0,emptyIntent());const before=r.current();const after=r.advance(20,emptyIntent());
    assert.notEqual(before.frame.highTide,after.frame.highTide);assert.notDeepEqual(before.frame.flooded,after.frame.flooded);
});

test('R6-L5 invalid fixtures fail before mutation; open doors and high tide use the checkpoint predicate', () => {
    const f=fixture(),r=f.runtime; const before=r.snapshotExpansion(), epoch=r.epoch, bytes=f.data.get(SESSION_KEY);
    const uid=r.enemies[0].uid;
    for(const p of [{x:360,y:342},{x:-1,y:0},{x:Infinity,y:3},{x:NaN,y:3}]) {
        assert.throws(()=>f.driver.placePlayer(p), /fixture/); assert.throws(()=>f.driver.placeEnemy(uid,p), /fixture/);
        assert.deepEqual(r.snapshotExpansion(),before);assert.equal(r.epoch,epoch);assert.equal(f.data.get(SESSION_KEY),bytes);
    }
    assert.throws(()=>f.driver.placePlayer({x:368,y:344},0,'missing'),/missing/);
    f.driver.placePlayer({x:368,y:344}); assert.ok(r.checkpoint()); assert.doesNotThrow(()=>decodeSession(f.data.get(SESSION_KEY)!));
    const d=r.space!.definition.doors[0],p={x:d.x*32+16,y:d.y*32+16};f.driver.door(d.id,false);
    assert.throws(()=>f.driver.placePlayer(p),/overlaps/);f.driver.door(d.id,true);f.driver.placePlayer(p);
    const s=r.snapshotExpansion();const raid=s.raid!;raid.highTide=true;raid.tideChanged=!raid.initialHigh;raid.elapsed=raid.tideChanged?300:0;raid.warned=raid.tideChanged;r.restoreExpansion(s);
    const def=r.space!.definition;let wet:{x:number;y:number}|undefined;
    for(let y=0;y<def.cells.length&&!wet;y++)for(let x=0;x<def.cells[y].length&&!wet;x++)if(def.cells[y][x]==='tide'&&checkpointBodyFits(r.space!,{x:x*32+16,y:y*32+16}))wet={x:x*32+16,y:y*32+16};
    assert.ok(wet);f.driver.placePlayer(wet);assert.ok(r.checkpoint());
    assert.doesNotThrow(()=>decodeSession(f.data.get(SESSION_KEY)!));
});


test('R6-L2 expiry reports HP-cap loss separately from blows or ongoing damage', () => {
    const f = fixture(), r = f.runtime, s = r.snapshotExpansion();
    s.body.effects.constitution = .05; s.body.hp = 115; r.restoreExpansion(s);
    r.advance(0, emptyIntent()); const batch = r.advance(100, emptyIntent());
    const events = batch.events.filter(e => e.type === 'hurt');
    assert.equal(r.hp, 100); assert.equal(events.length, 1);
    assert.ok(events[0].type === 'hurt'); assert.equal(events[0].cause, 'limit-change'); assert.equal(events[0].damage, 15);
});

test('R6-L3 actual player and enemy hits carry ownership after restored bullets', () => {
    for (const layered of [false, true]) for (const enemyShot of [false, true]) {
        const f = fixture(layered), r = f.runtime, s = r.snapshot(), enemy = s.enemies[0];
        const p = { x: s.player.x + 16, y: s.player.y };
        Object.assign(enemy, p, { home: { ...p }, target: { ...p }, path: [] });
        const origin = enemyShot ? s.player : p;
        s.bullets = [{ uid: layered ? entityUid({ version: 2, runId: s.runId }, s.nextEntity++) : 'entity-' + s.nextEntity++, x: origin.x, y: origin.y,
            rotation: 0, vx: 100, vy: 0, damage: 1, left: 100, enemy: enemyShot, ...(enemyShot ? { owner: enemy.uid } : {}) }];
        r.restore(s); const expectedOwner = enemyShot ? enemy.uid : 'player';
        assert.equal(r.current().frame.bullets[0].owner, expectedOwner); r.updateBullets(.02);
        const hit = r.current().events.find(e => e.type === 'impact');
        assert.ok(hit?.type === 'impact'); assert.equal(hit.reason, 'hit-actor');
        assert.equal(hit.owner, expectedOwner); assert.equal(hit.target, enemyShot ? 'player' : enemy.uid);
    }
});
