import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { prototypeRaid, prototypeWorld } from './fixtures/layered';
import { archetype, initialTactics } from '../src/enemy-archetypes';
import { changeLayer } from '../src/layer-transition';
import { advancePursuits } from '../src/pursuit';
import { validateExpansion } from '../src/expansion-state';
import { MARKET_POSTS, MARKET_RAIDERS } from '../src/enemy-posts';

function fixture(ids = ['raider-melee', 'raider-lookout']) {
    const world = prototypeWorld(), profile = D.newSave(), state = prototypeRaid(profile, world), raid = state.raid!;
    Object.assign(raid, { version: 4, shockAt: -10, mapEvent: 'none' }); raid.maps.downstairs.bullets = [];
    raid.maps.downstairs.enemies.forEach((e, i) => {
        const id = ids[i]; Object.assign(e, { id, hp: archetype(id)!.hp, tactics: initialTactics(id, 'squad') });
        Object.assign(e.tactics!, { stance: 'hostile', awareness: 1, signalUsed: true,
            memory: { at: { x: raid.player.x, y: raid.player.y }, time: 0, source: 'sight', target: 'player' } });
        raid.roster[i].id = id;
    });
    return { world, profile, state, raid };
}

test('new pursuit keeps one identity and paid equipment, reacquires sight instead of carrying cross-floor coordinates', () => {
    const f = fixture(), melee = f.raid.maps.downstairs.enemies[0], lookout = f.raid.maps.downstairs.enemies[1];
    assert.ok(changeLayer(f.state, f.world, 'up')); assert.equal(f.raid.pursuits.length, 1);
    assert.equal(f.raid.pursuits[0].enemy.uid, melee.uid); assert.equal(f.raid.maps.downstairs.enemies[0].uid, lookout.uid);
    const restored = validateExpansion(JSON.parse(JSON.stringify(f.state)), f.profile, null, () => f.world)!;
    restored.raid!.elapsed = restored.raid!.pursuits[0].arrivalAt;
    assert.ok(advancePursuits(restored, f.world));
    const arrived = restored.raid!.maps.upstairs.enemies[0];
    assert.equal(arrived.uid, melee.uid); assert.equal(arrived.hp, melee.hp); assert.equal(arrived.tactics!.signalUsed, true);
    assert.equal(arrived.tactics!.memory, null); assert.equal(arrived.tactics!.stance, 'idle');
    assert.equal(restored.raid!.pursuits.length, 0); assert.equal(advancePursuits(restored, f.world), false);
    validateExpansion(restored, f.profile, null, () => f.world);
});

test('reports, unseen connectors, guards and paid attack phases never become new cross-layer pursuit', () => {
    for (const reason of ['report', 'hidden', 'windup', 'guard', 'market-post']) {
        const f = fixture(reason === 'guard' ? ['blockade-sentry', 'blockade-sergeant'] : undefined);
        const enemy = f.raid.maps.downstairs.enemies[0];
        if (reason === 'report') enemy.tactics!.memory!.source = 'report';
        if (reason === 'hidden') f.world.maps.downstairs.cells[1][2] = 'wall';
        if (reason === 'windup') { enemy.tactics!.phase = 'windup'; enemy.tactics!.phaseLeft = .3; }
        if (reason === 'market-post') { enemy.tactics!.squad = MARKET_RAIDERS; enemy.home = { ...MARKET_POSTS.find(p => p.id === enemy.id)!.home }; }
        assert.ok(changeLayer(f.state, f.world, 'up')); assert.equal(f.raid.pursuits.length, 0, reason);
    }
});

test('new pursuit has two existing-member slots and never allocates a new actor', () => {
    const f = fixture(['raider-melee', 'mercenary-assault']), third = structuredClone(f.raid.maps.downstairs.enemies[0]);
    third.uid = 'enemy-2'; third.x = 112; third.y = 112;
    f.raid.maps.downstairs.enemies.push(third); f.raid.roster.push({ uid: third.uid, id: third.id }); f.world.enemyCount = 3;
    assert.ok(changeLayer(f.state, f.world, 'up')); assert.equal(f.raid.pursuits.length, 2);
    assert.equal(f.raid.maps.downstairs.enemies.length, 1);
    assert.equal(new Set([...f.raid.maps.downstairs.enemies, ...f.raid.pursuits.map(p => p.enemy)].map(e => e.uid)).size, 3);
    validateExpansion(f.state, f.profile, null, () => f.world);
});
