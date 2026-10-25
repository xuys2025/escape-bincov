import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENEMY_CATALOG, ENEMY_FACTIONS,
    type EnemyArchetype, type EnemyArchetypeId, type EnemyFactionId } from '../scripts/enemy-catalog-data';
import { LEGACY_ENEMY_PROFILES, getLegacyEnemyProfile, type LegacyEnemyId } from '../src/enemy-profile';
import { ENEMIES } from '../src/domain';
import { BUILDING_WORLD } from '../src/building-world';
import { WORLD } from '../src/world';

test('the eighteen design identities stay stable and separate from legacy save IDs', () => {
    const expected: readonly EnemyArchetypeId[] = ['raider-melee', 'raider-gunner', 'raider-lookout', 'raider-boss',
        'tidal-crab', 'saltback-dog', 'sac-spitter', 'salt-dazed', 'tide-chaser', 'tide-ritualist', 'salt-hulk',
        'mercenary-scout', 'mercenary-assault', 'mercenary-support', 'recovery-leader',
        'blockade-sentry', 'blockade-patrol', 'blockade-sergeant'];
    assert.deepEqual(ENEMY_CATALOG.map(card => card.id), expected);
    assert.deepEqual(ENEMY_CATALOG.map(card => card.designNumber), Array.from({ length: 18 }, (_, i) => String(i + 1).padStart(2, '0')));
    assert.equal(new Set(ENEMY_CATALOG.map(card => card.id)).size, 18);
    assert.equal(new Set(ENEMY_CATALOG.map(card => card.name)).size, 18);
    const countByFaction: Record<EnemyFactionId, number> = { raiders: 4, tidalFauna: 3, saltAffected: 4, mercenaries: 4, coastalBlockade: 3 };
    assert.deepEqual(Object.keys(ENEMY_FACTIONS).sort(), Object.keys(countByFaction).sort());
    for (const [faction, count] of Object.entries(countByFaction)) assert.equal(ENEMY_CATALOG.filter(card => card.faction === faction).length, count);
    const cards: readonly EnemyArchetype[] = ENEMY_CATALOG;
    for (const card of cards) {
        assert.equal(card.implementation, 'street-prototype');
        assert.equal(Object.hasOwn(ENEMIES, card.id), false, 'new archetypes must not reinterpret legacy IDs');
        assert.equal(Object.hasOwn(LEGACY_ENEMY_PROFILES, card.id), false);
        assert.equal(card.assets.status, 'body-and-corpse');
        assert.ok(card.weaponCategories.length && card.assets.animations.length && card.engagementRule && card.disengageRule);
        for (const field of ['hp', 'damage', 'speed', 'range', 'vision', 'cooldown', 'legacyId']) assert.equal(Object.hasOwn(card, field), false);
    }
});

test('conditional groups preserve warning, task and negotiation boundaries', () => {
    const conditional = ENEMY_CATALOG.filter(card => card.defaultStance === 'conditional');
    assert.deepEqual(conditional.map(card => card.designNumber), ['10', '12', '13', '14', '15', '16', '17', '18']);
    for (const card of ENEMY_CATALOG.filter(card => card.faction === 'coastalBlockade')) {
        assert.equal(card.defaultStance, 'conditional');
        assert.match(card.disengageRule, /退回|脱离/);
    }
    const sentry = ENEMY_CATALOG.find(card => card.id === 'blockade-sentry')!;
    assert.match(sentry.engagementRule, /先提醒/);
    assert.match(sentry.engagementRule, /直接攻击立即自卫/);
    assert.match(sentry.disengageRule, /未伤人未开火/);
    assert.match(ENEMY_CATALOG.find(card => card.id === 'recovery-leader')!.engagementRule, /交涉/);
    assert.match(ENEMY_CATALOG.find(card => card.id === 'salt-dazed')!.engagementRule, /不混入患者队列/);
    assert.match(ENEMY_CATALOG.find(card => card.id === 'tide-ritualist')!.engagementRule, /激进分支/);
    const identityText = ENEMY_CATALOG.map(card => `${card.id} ${card.name}`).join(' ');
    assert.doesNotMatch(identityText, /宋姐|林满仓|鲍经理|顾阿婆|顾海生|老蔡|钟队长|普通患者|住民/);
});

test('legacy compatibility keeps exact old body, weapon, attack and corpse loot behavior', () => {
    const expected = {
        scav: { bodyKind: 'scav', weapon: 'club', attack: 'melee', corpseLootRolls: 1 },
        salt: { bodyKind: 'salt', weapon: 'rifle', attack: 'projectile', corpseLootRolls: 1 },
        creature: { bodyKind: 'creature', weapon: 'claw', attack: 'melee', corpseLootRolls: 1 },
        elite: { bodyKind: 'elite', weapon: 'rifle', attack: 'projectile', corpseLootRolls: 3 },
    };
    assert.deepEqual(LEGACY_ENEMY_PROFILES, expected);
    assert.deepEqual(Object.keys(LEGACY_ENEMY_PROFILES).sort(), Object.keys(ENEMIES).sort());
    for (const id of Object.keys(expected) as LegacyEnemyId[]) assert.strictEqual(getLegacyEnemyProfile(id), LEGACY_ENEMY_PROFILES[id]);
    assert.deepEqual(Object.values(ENEMIES).map(enemy => [enemy.id, enemy.hp, enemy.speed, enemy.damage, enemy.range, enemy.vision, enemy.cooldown]), [
        ['scav', 56, 69, 11, 30, 220, .9], ['salt', 76, 56, 12, 270, 300, 1.2],
        ['creature', 38, 105, 8, 26, 245, .7], ['elite', 190, 49, 20, 340, 350, 1.15],
    ]);
});

test('legacy lookup rejects unknown, inherited and design keys without fallback', () => {
    for (const id of ['', 'unknown', 'SCAV', 'scav ', '__proto__', 'constructor', 'toString', 'hasOwnProperty', ...ENEMY_CATALOG.map(card => card.id)]) {
        assert.throws(() => getLegacyEnemyProfile(id), RangeError, id);
    }
});

test('catalog and compatibility tables cannot be mutated through nested references', () => {
    assert.ok(Object.isFrozen(ENEMY_CATALOG) && Object.isFrozen(ENEMY_FACTIONS) && Object.isFrozen(LEGACY_ENEMY_PROFILES));
    for (const card of ENEMY_CATALOG) {
        for (const part of [card, card.behavior, card.weaponCategories, card.assets, card.assets.animations]) assert.ok(Object.isFrozen(part));
    }
    for (const profile of Object.values(LEGACY_ENEMY_PROFILES)) assert.ok(Object.isFrozen(profile));
    assert.equal(Reflect.set(ENEMY_CATALOG[0].behavior, 'combat', 'changed'), false);
    assert.equal(Reflect.set(LEGACY_ENEMY_PROFILES.scav, 'attack', 'projectile'), false);
    assert.equal(getLegacyEnemyProfile('scav').attack, 'melee');
});

test('the documented first street sample sites are real outdoor floor cells clear of entries', () => {
    const coast = BUILDING_WORLD.maps.coast;
    for (const [x, y] of [[20, 18], [28, 22], [25, 13]]) {
        assert.equal(coast.cells[y][x], 'floor', `sample (${x},${y})`);
        const point = { x: (x + .5) * coast.tile, y: (y + .5) * coast.tile };
        assert.ok(!coast.entries.some(entry => Math.hypot(entry.at.x - point.x, entry.at.y - point.y) < coast.tile * 2));
        for (const spawn of WORLD.spawns)
            assert.ok(Math.hypot(spawn.x - point.x, spawn.y - point.y) > coast.tile * 10, `sample (${x},${y}) near spawn (${spawn.x},${spawn.y})`);
    }
});
