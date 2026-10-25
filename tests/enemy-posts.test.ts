import test from 'node:test';
import assert from 'node:assert/strict';
import { MARKET_POSTS, MARKET_RAIDERS, MARKET_STORES, enemyPost } from '../src/enemy-posts';
import { createSessionState, SaveSession } from '../src/session';
import { BUILDING_WORLD } from '../src/building-world';
import { WORLD } from '../src/world';
import { corridor, separation, spacePath, traversable } from '../src/spatial';
import { decodeSession, SESSION_KEY } from '../src/recovery-store';
import { CoastRaidRuntime, emptyIntent } from '../src/raid-runtime/runtime';
import { advanceTacticalEnemy } from '../src/raid-runtime/tactical-enemy';
import { canonicalBehavior } from './fixtures/enemy-benchmark';

function fixture(seed = 45, raw?: string, legacyEnemies = false) {
    const data = new Map<string,string>(raw ? [[SESSION_KEY, raw]] : []), state = createSessionState();
    const saves = new SaveSession(state, () => ({ getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k,v) }), undefined, () => 1800000000000);
    assert.ok(saves.initialize(), state.storageError);
    if (!raw) { state.state = 'hideout'; assert.ok(saves.beginRun(seed, true, { legacyEnemies }), state.storageError); }
    return { state, saves, data, raid: state.expansion!.raid! };
}

test('market compound replaces three slots, preserves story guards and moves a single existing supply crate', () => {
    for (const seed of [5, 10, 45, 100, 995]) {
        const f = fixture(seed), old = fixture(seed, undefined, true), actors = Object.values(f.raid.maps).flatMap(m => m.enemies);
        const market = actors.filter(e => e.tactics?.squad === MARKET_RAIDERS);
        assert.equal(actors.length, 25); assert.equal(new Set(actors.map(e => e.uid)).size, 25);
        assert.deepEqual(market.map(e => e.id).sort(), MARKET_POSTS.map(e => e.id).sort());
        for (const e of market) { assert.ok(enemyPost(e)); assert.equal(e.hp, e.id === 'raider-boss' ? 120 : e.id === 'raider-melee' ? 56 : 68); }
        const elitePositions = (r: typeof f.raid) => Object.values(r.maps).flatMap(m => m.enemies).filter(e => e.id === 'elite').map(e => [e.uid,e.x,e.y]);
        assert.deepEqual(elitePositions(f.raid), elitePositions(old.raid));
        const contents = (r: typeof f.raid) => canonicalBehavior(r.maps.coast.containers.map(c => ({ ...c, x: 0, y: 0 })), r.runId);
        assert.equal(contents(f.raid), contents(old.raid), 'no new items, names, quantities or container identities');
        assert.equal(f.raid.maps.coast.containers.filter(c => separation(c, MARKET_STORES) < .1).length, 1);
        assert.ok(f.saves.persist(), f.state.storageError); assert.doesNotThrow(() => decodeSession(f.data.get(SESSION_KEY)!));
        assert.equal(old.raid.maps.coast.enemies.filter(e => e.tactics).length, 0, 'old deployments remain untouched');
    }
    assert.equal(fixture(42).raid.maps.coast.enemies.filter(e => e.tactics?.squad === MARKET_RAIDERS).length, 0);
});

test('market posts, fallback paths and a public bypass stay clear at both tides', () => {
    const f = fixture(), map = BUILDING_WORLD.maps.coast;
    for (const highTide of [false,true]) {
        const context = { definition: map, doors: f.raid.maps.coast.doors, highTide };
        for (const post of MARKET_POSTS) {
            for (const p of [post.home, post.fallback, ...post.patrol]) {
                assert.ok(traversable(context,p,'body',10));
                assert.ok(WORLD.spawns.every(s => separation(s,p) >= 320)); assert.ok(WORLD.exits.every(s => separation(s,p) >= 160));
                assert.ok(map.entries.every(s => separation(s.at,p) >= 96));
                assert.ok(map.doors.every(d => separation({ x:(d.x+.5)*32,y:(d.y+.5)*32 },p) >= 96));
            }
            assert.ok(spacePath(context,post.home,post.fallback,true).length);
            assert.ok(post.patrol.every(p => corridor(context,post.home,p,'body',10)));
        }
        // Existing raised west road bypasses the compound outside every member's sight radius.
        for (const y of [28,34,40]) {
            const p = { x: 6.5*32,y:(y+.5)*32 }; assert.ok(traversable(context,p,'body',10));
            assert.ok(MARKET_POSTS.every(post => separation(post.home,p) > 340));
        }
    }
});

test('market patrol wait/target survive real checkpoint restore and its guards keep their posts', () => {
    const f = fixture(); f.state.state = 'run'; const r = new CoastRaidRuntime(f.state,f.saves);
    r.advance(0,emptyIntent()); r.advance(500,emptyIntent()); assert.ok(r.checkpoint());
    const before = r.snapshotExpansion(), raw = f.data.get(SESSION_KEY)!, restored = fixture(45,raw);
    assert.ok(restored.saves.resumeRun()); restored.state.state = 'run'; const other = new CoastRaidRuntime(restored.state,restored.saves);
    const market = (state: typeof before) => state.raid!.maps.coast.enemies.filter(e => e.tactics?.squad === MARKET_RAIDERS);
    assert.deepEqual(market(other.snapshotExpansion()),market(before));
    const guard = f.raid.maps.coast.enemies.find(e => e.id === 'raider-melee' && e.tactics?.squad === MARKET_RAIDERS)!;
    assert.ok(enemyPost(guard));
    // Both real runtimes settle normally, rather than discarding simulated frames via startup rollback.
    r.finish('abandon'); r.dispose(); other.finish('abandon'); other.dispose();
});

test('market leader retreats to the alternate position only after visible guard loss; stale patrol is bounded', () => {
    const f = fixture(), enemies = f.raid.maps.coast.enemies.filter(e => e.tactics?.squad === MARKET_RAIDERS);
    const boss = enemies.find(e => e.id === 'raider-boss')!, post = enemyPost(boss)!;
    let visible = false;
    const world = { elapsed: 10, player: { x:boss.x,y:boss.y+200 }, enemies, highTide:false, shotNoise:null, noiseTime:0,noiseRadius:0,space:null,
        sight: () => visible,walkable:()=>true,dryRefuge:()=>null,path:(_a:unknown,b:{x:number;y:number})=>[b],move:(e:{x:number;y:number},dx:number,dy:number)=>{e.x+=dx;e.y+=dy;} };
    const effects = {fire(){},strike(){},openDoor(){},notice(){}};
    Object.assign(boss.tactics!, { stance:'hostile',awareness:1,memory:{at:{...world.player},time:10,source:'sight',target:'player'} });
    enemies.find(e=>e.id==='raider-melee')!.hp=0;
    advanceTacticalEnemy(world,effects,boss,.05); assert.notEqual(boss.tactics!.stance,'retreat');
    visible=true; world.elapsed+=.05; advanceTacticalEnemy(world,effects,boss,.05);
    assert.equal(boss.tactics!.stance,'retreat'); assert.deepEqual(boss.target,post.fallback);
    const copy=structuredClone(boss); world.elapsed+=.05; advanceTacticalEnemy({...world,enemies:[copy]},effects,copy,.05);
    assert.deepEqual(copy.target,post.fallback,'restored retreat remains paid even with no newly visible losses');
});
