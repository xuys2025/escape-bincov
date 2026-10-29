import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { newExpansion } from '../src/expansion-state';
import { advanceBaseRecovery, advanceRealTime, buildFacility, enqueueProduction, cancelProduction, claimProduction, practice } from '../src/base';

const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
test('零资源基地30分钟并行恢复符合设计，流血不造成离线损血且首次返站可休息', () => {
    const state = newExpansion(0); Object.assign(state.body, { hp: 60, stamina: 0, mental: 30, water: 20, satiety: 10, pollution: 40, bleeding: true });
    advanceBaseRecovery(state, 1800);
    close(state.body.hp, 90); close(state.body.water, 80); close(state.body.satiety, 55); close(state.body.mental, 60); close(state.body.pollution, 25);
    assert.equal(state.body.bleeding, false); assert.equal(state.body.stamina, 100);
    const rested = newExpansion(0); advanceBaseRecovery(rested, 120); assert.equal(rested.body.effects.energized, 600);
    advanceBaseRecovery(rested, 1000); assert.equal(rested.body.effects.energized, 0); assert.equal(rested.base.energizedGranted, true);
});

test('长离线按强化到期、治疗和上限分段，与逐秒在线计算等价', () => {
    const state = newExpansion(0); state.base.facilities.rest = 3; state.base.facilities.medical = 3;
    state.body.effects.constitution = 180; state.body.effects.strength = 180; state.body.effects.pain = 60;
    state.body.hp = 112; state.body.stamina = 0; state.body.bleeding = true;
    const online = structuredClone(state); advanceBaseRecovery(state, 10000);
    for (let i = 0; i < 10000; i++) advanceBaseRecovery(online, 1);
    for (const key of ['hp', 'stamina', 'mental', 'water', 'satiety', 'pollution'] as const) close(state.body[key], online.body[key]);
    assert.deepEqual(state.body.effects, online.body.effects); assert.equal(state.body.bleeding, false); assert.equal(state.body.hp, 100);
});

test('五设施各级成本/前置替代一次支付，救济不能变成建设材料，黑市海珠只扣一件', () => {
    const profile = D.newSave(), state = newExpansion(0); profile.cash = 10000; profile.stash = D.createInventory(D.STASH_W, D.STASH_ROWS);
    profile.bag = D.createInventory(6, 5); profile.safe = D.createInventory(2, 2);
    D.addItem(profile.stash, 'bandage', 2, true);
    assert.equal(buildFacility(profile, state, 'medical'), false);
    profile.quests.repair = true; assert.equal(buildFacility(profile, state, 'medical'), false);
    D.addItem(profile.stash, 'bandage', 2); assert.equal(buildFacility(profile, state, 'medical'), true);
    assert.equal(D.count(profile.stash, 'bandage'), 2); assert.equal(profile.cash, 9650);
    D.addItem(profile.safe, 'pearl', 1); assert.equal(buildFacility(profile, state, 'blackmarket'), false);
    state.base.extractedPearl = true; assert.equal(buildFacility(profile, state, 'blackmarket'), true);
    assert.equal(D.count(profile.safe, 'pearl'), 0); assert.equal(profile.cash, 9150);
});

test('有限串行生产锁定入队等级，取消只退排队批次，整批领取不重复、空间不足不改状态', () => {
    const profile = D.newSave(), state = newExpansion(0); state.base.facilities.workbench = 2;
    profile.cash = 1000; profile.stash = D.createInventory(D.STASH_W, D.STASH_ROWS); D.addItem(profile.stash, 'cloth', 6);
    assert.equal(enqueueProduction(profile, state, 'bandage'), true); assert.equal(enqueueProduction(profile, state, 'bandage'), true);
    assert.equal(enqueueProduction(profile, state, 'bandage'), false); assert.equal(profile.cash, 930);
    state.base.facilities.workbench = 3; assert.equal(state.base.queue[0].duration, 510);
    assert.equal(cancelProduction(profile, state, 'batch-1'), false); assert.equal(cancelProduction(profile, state, 'batch-2'), true);
    assert.equal(profile.cash, 965); assert.equal(D.count(profile.stash, 'cloth'), 4);
    advanceRealTime(state, 600000); assert.equal(state.base.completed.length, 1);
    profile.safe.items = []; D.addItem(profile.safe, 'watch', 8); const blocked = structuredClone(state);
    assert.equal(claimProduction(profile, state, 'batch-1', 'safe'), false); assert.deepEqual(state, blocked);
    assert.equal(claimProduction(profile, state, 'batch-1', 'stash'), true); assert.equal(D.count(profile.stash, 'bandage'), 2);
    assert.equal(claimProduction(profile, state, 'batch-1', 'stash'), false);
});

test('行动/待结算仅推进生产，不补回血、buff或训练；回拨不降低游标', () => {
    const state = newExpansion(1000); state.base.location = 'raid'; state.body.hp = 40; state.body.effects.focus = 120;
    advanceRealTime(state, 2000000); assert.equal(state.body.hp, 40); assert.equal(state.body.effects.focus, 120);
    state.base.location = 'settlement'; advanceRealTime(state, 3000000); assert.equal(state.body.hp, 40);
    state.base.location = 'base'; advanceRealTime(state, 1000); assert.equal(state.base.cursor, 3000000); assert.equal(state.body.hp, 40);
});

test('基地练习拒绝挂机/长跳时长/离线，每120有效秒给0.25量，三属性共享窗口且刷新状态不重置', () => {
    let state = newExpansion(0); state.base.facilities.training = 1;
    assert.equal(practice(state, 'strength', { x: 0, y: 0 }, { x: 0, y: 0 }, .1, 100), false);
    assert.equal(practice(state, 'strength', { x: 0, y: 0 }, { x: 1, y: 0 }, 600, 100), false);
    for (let i = 0; i < 1200; i++) practice(state, 'strength', { x: 0, y: 0 }, { x: 1, y: 0 }, .1, i * 100);
    close(state.base.training.quantity, .2625); close(state.growth.progress.strength, .0525);
    state = JSON.parse(JSON.stringify(state));
    for (let i = 1200; i < 4800; i++) practice(state, i % 2 ? 'technique' : 'constitution', { x: 0, y: 0 }, { x: 1, y: 0 }, .1, i * 100);
    close(state.base.training.quantity, 1);
    advanceRealTime(state, 599000); close(state.base.training.quantity, 1);
    practice(state, 'strength', { x: 0, y: 0 }, { x: 1, y: 0 }, .1, 600000); assert.equal(state.base.training.quantity, 0);
});
