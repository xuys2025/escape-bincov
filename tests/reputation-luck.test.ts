import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { newExpansion } from '../src/expansion-state';
import { reputationTier, factionAccess, reputationPrice, applyAward, rollLuckUnit, initialLuck, luckInventory, equipCharm, unequipCharm, effectiveLuck } from '../src/reputation-luck';
import { resolveLayerShot, advanceLayerShots, settleDepartingShots } from '../src/layer-transition';
import { prototypeWorld, prototypeRaid } from './fixtures/layered';

function expansion() { const state = newExpansion(0); state.version = 2; state.charm = null; state.awards = []; return state; }
function battle() { const world = prototypeWorld(), profile = D.newSave(), state = prototypeRaid(profile, world, expansion()); state.raid!.version = 2; state.raid!.shockAt = -10; state.raid!.mapEvent = 'none'; state.raid!.maps.downstairs.bullets = []; return { world, profile, state }; }
function seedFor(first: (value: number) => boolean, second: (value: number) => boolean = () => true) { for (let seed = 1; seed <= 10000; seed++) { const random = D.seededRandom(seed); if (first(random()) && second(random())) return seed; } throw new Error('No deterministic seed'); }

test('声望等级端点、实时资格、折扣舍入最低1；公共商人和原任务不绑定阵营', () => {
    for (const [value, tier] of [[-50, '敌对'], [-49, '冷淡'], [-10, '冷淡'], [-9, '中立'], [29, '中立'], [30, '友好'], [69, '友好'], [70, '信赖']] as const) assert.equal(reputationTier(value), tier);
    assert.equal(factionAccess(-50), false); assert.equal(factionAccess(-49), true); assert.equal(factionAccess(29, 1), false); assert.equal(factionAccess(70, 2), true);
    assert.equal(reputationPrice(320, 30), 304); assert.equal(reputationPrice(1, 70), 1); assert.equal(reputationPrice(35, -10), 39);
    assert.deepEqual(Object.keys(D.QUESTS), ['repair', 'sample', 'ledger']); assert.ok(D.MERCHANTS.med.stock.includes('bandage'));
});
test('通用配置奖励一次扣料、发现金、全部声望/属性/幸运并保存凭据，满级不换成现金', () => {
    const profile = D.newSave(), state = expansion(); state.growth.reputation = { fixture_a: 68, fixture_b: -47 }; state.growth.permanent.strength = 30;
    const award = { id: 'fixture-commission', cash: 15, needs: [{ id: 'bandage', qty: 1 }], reputation: { fixture_a: 15, fixture_b: -5 }, attributes: ['strength' as const], luck: 1 as const };
    const oldCash = profile.cash; assert.equal(applyAward(profile, state, award), true);
    assert.deepEqual(state.growth.reputation, { fixture_a: 83, fixture_b: -52 }); assert.equal(state.growth.permanent.strength, 30); assert.equal(profile.cash, oldCash + 15);
    const committed = JSON.stringify([profile, state]); assert.equal(applyAward(profile, state, award), false); assert.equal(JSON.stringify([profile, state]), committed);
});
test('幸运1不改原物资且不抽取；低幸运保护任务、救济、单件原物品，高幸运追加一次', () => {
    let draws = 0; const random = () => { draws++; return 0; };
    const unit = [{ id: 'bandage', qty: 1 }]; assert.deepEqual(rollLuckUnit(unit, 1, random), unit); assert.equal(draws, 0);
    assert.deepEqual(rollLuckUnit(unit, -3, random), unit);
    assert.deepEqual(rollLuckUnit([{ id: 'sample', qty: 1, protected: true }, { id: 'wire', qty: 1, protected: true }], -3, random), [{ id: 'sample', qty: 1, protected: true }, { id: 'wire', qty: 1, protected: true }]);
    assert.deepEqual(rollLuckUnit(unit, 5, random), [...unit, { id: 'watch', qty: 1 }]);
});
test('同名普通/救济堆低幸运只减普通，满容器好运溢出变成同图地面物资', () => {
    const { state } = battle(), raid = state.raid!, inventory = D.createInventory(6, 5);
    D.addItem(inventory, 'water', 1); D.addItem(inventory, 'water', 2, true);
    state.growth.luck = -3; raid.rng = seedFor(v => v < .08); luckInventory(state, 'downstairs', inventory, { x: 80, y: 80 });
    assert.equal(inventory.items.length, 1); assert.equal(inventory.items[0].qty, 2); assert.equal(inventory.items[0].relief, true);
    inventory.items = []; D.addItem(inventory, 'watch', 60); state.growth.luck = 5; raid.rng = seedFor(v => v < .08);
    luckInventory(state, 'downstairs', inventory, { x: 80, y: 80 }); assert.equal(raid.maps.downstairs.loot.length, 1); assert.equal(D.count(inventory, 'watch'), 60);
});
test('初始幸运单元和地图事件只判定一次，重复恢复/打开不会继续抽取或增产', () => {
    const { state } = battle(); state.growth.luck = 5; state.raid!.maps.downstairs.loot = [{ uid: 'ground-first', id: 'ammo9', qty: 20, relief: false, x: 112, y: 112 }];
    initialLuck(state); assert.equal(state.raid!.eventRolled, true); const saved = structuredClone(state);
    initialLuck(state); assert.deepEqual(state, saved);
});
test('饰品交换守恒、满栏拒绝卸下、隐藏幸运仅临时改变且夹在范围内', () => {
    const profile = D.newSave(), state = expansion(); D.addItem(profile.stash, 'luckyCharm', 1); D.addItem(profile.stash, 'unluckyCharm', 1);
    const lucky = profile.stash.items.find(i => i.id === 'luckyCharm')!; assert.equal(equipCharm(profile, state, lucky.uid, 'stash'), true);
    assert.equal(state.charm!.uid, lucky.uid); assert.equal(effectiveLuck(state), 2); assert.equal(state.growth.luck, 1);
    const bad = profile.stash.items.find(i => i.id === 'unluckyCharm')!; assert.equal(equipCharm(profile, state, bad.uid, 'stash'), true);
    assert.equal(D.count(profile.stash, 'luckyCharm'), 1); assert.equal(profile.stash.items.find(i => i.id === 'luckyCharm')!.uid, lucky.uid); assert.equal(effectiveLuck(state), 0);
    profile.stash = D.createInventory(D.STASH_W, D.STASH_ROWS); D.addItem(profile.stash, 'watch', D.STASH_W * D.STASH_ROWS * D.ITEMS.watch.stack); assert.equal(unequipCharm(profile, state), false); assert.equal(state.charm!.uid, bad.uid);
    profile.stash.items = []; assert.equal(unequipCharm(profile, state), true); assert.equal(profile.stash.items[0].uid, bad.uid); assert.equal(state.charm, null);
});
test('中心仍可不暴击，边缘仍可暴击，miss不抽取；实际枪傷不会按过量或匕首计训练', () => {
    const { world, state } = battle(), raid = state.raid!, enemy = raid.maps.downstairs.enemies[1];
    enemy.x = 112; enemy.y = 112; const shot = { uid: 'test-shot', x: 48, y: 112, rotation: 0, vx: 500, vy: 0, left: 100, damage: 27, enemy: false };
    raid.rng = seedFor(v => v >= .1); resolveLayerShot(state, world, 'downstairs', shot, true); assert.equal(enemy.hp, 29);
    enemy.hp = 56; raid.rng = seedFor(v => v < .02); resolveLayerShot(state, world, 'downstairs', { ...shot, y: 98.001 }, true); assert.equal(enemy.hp, 15.5);
    const before = raid.rng; resolveLayerShot(state, world, 'downstairs', { ...shot, left: 1 }, true); assert.equal(raid.rng, before);
});
test('霰弹逐颗独立：一暴击一普通为37.5伤害，离层和正常飞行结果/RNG完全一致', () => {
    const { world, state } = battle(), raid = state.raid!; raid.maps.downstairs.enemies[0].hp = 56;
    raid.rng = seedFor(v => v < .1, v => v >= .1);
    raid.maps.downstairs.bullets = [0, 1].map(i => ({ uid: `shot-${i}`, x: 64, y: 48, rotation: 0, vx: 500, vy: 0, left: 120, damage: 15, enemy: false }));
    const departure = structuredClone(state), feedback: boolean[] = [];
    advanceLayerShots(state, world, 'downstairs', 1, (_id, critical) => feedback.push(critical)); settleDepartingShots(departure, world, 'downstairs');
    assert.deepEqual(feedback, [true, false]); assert.equal(state.raid!.maps.downstairs.enemies[0].hp, 18.5);
    assert.deepEqual(state, departure);
});
