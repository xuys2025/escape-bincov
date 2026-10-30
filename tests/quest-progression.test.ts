import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { questProgress } from '../src/qol';

test('stockpiled quest items cannot bypass prerequisites or successful-extraction milestones', () => {
    const save = D.newSave();
    for (const q of Object.values(D.QUESTS)) for (const [id, n] of Object.entries(q.needs)) assert.equal(D.addItem(save.stash, id, n), 0);
    const before = structuredClone(save);
    assert.equal(D.submitQuest(save, 'sample'), false);
    assert.equal(D.submitQuest(save, 'ledger'), false);
    assert.deepEqual(save, before, 'locked quests consume nothing and pay nothing');
    save.stats.extracts = 6; save.stats.runs = 100;
    assert.equal(D.submitQuest(save, 'ledger'), false, 'enough extractions does not bypass the preceding task');
    assert.equal(D.submitQuest(save, 'sample'), false);
    save.stats.extracts = 2;
    assert.equal(D.submitQuest(save, 'repair'), true, 'power and the first gun shelf remain an introductory goal');
    assert.equal(D.submitQuest(save, 'sample'), false);
    assert.ok(D.armsStock(save).includes('mb4a1')); assert.ok(!D.armsStock(save).includes('augb'));
    save.stats.extracts = 3;
    assert.equal(D.submitQuest(save, 'sample'), true); assert.ok(D.armsStock(save).includes('augb'));
    save.stats.extracts = 5;
    assert.equal(D.submitQuest(save, 'ledger'), false);
    assert.ok(D.lateParts(save.stats.runs).every(id => !D.armsStock(save).includes(id)));
    save.stats.extracts = 6;
    assert.equal(D.submitQuest(save, 'ledger'), true);
    assert.ok(D.lateParts(save.stats.runs).every(id => D.armsStock(save).includes(id)));
    const done = structuredClone(save);
    assert.equal(D.submitQuest(save, 'ledger'), false); assert.deepEqual(save, done);
});

test('failed runs and an active raid do not advance or spend quest progress', () => {
    const save = D.newSave(); save.quests.repair = true;
    D.addItem(save.safe, 'sample');
    // SaveSession maps abandonment to the existing death settlement.
    for (const outcome of ['death', 'timeout'] as const) {
        const loadout = D.beginRun(save, 42);
        assert.equal(D.submitQuest(save, 'sample'), false);
        D.settleRun(save, loadout, outcome, 0);
        assert.equal(D.submitQuest(save, 'sample'), false);
    }
    assert.equal(save.stats.extracts, 0); assert.equal(D.count(save.safe, 'sample'), 1);
    for (let i = 1; i <= 3; i++) {
        const loadout = D.beginRun(save, 42);
        D.settleRun(save, loadout, 'extract', 0);
        assert.equal(D.submitQuest(save, 'sample'), i === 3);
    }
});

test('unfinished legacy quests use existing stats; already earned shelves and rewards remain intact', () => {
    const save = D.newSave(); save.quests.sample = true; save.quests.ledger = true;
    const stock = D.armsStock(save), before = structuredClone(save);
    assert.deepEqual(D.questRequirements(save, 'sample'), []);
    assert.deepEqual(D.questRequirements(save, 'ledger'), []);
    assert.equal(D.submitQuest(save, 'ledger'), false);
    assert.deepEqual(save, before); assert.deepEqual(D.armsStock(save), stock);
    assert.ok(stock.includes('augb')); assert.ok(D.lateParts(0).every(id => stock.includes(id)));
    for (const id of ['__proto__', 'constructor', 'unknown']) assert.equal(D.submitQuest(save, id), false);
    const pending = D.newSave(); pending.quests.repair = true; pending.stats.runs = 6; pending.stats.extracts = 6;
    D.addItem(pending.stash, 'sample'); D.addItem(pending.stash, 'ledger');
    assert.equal(D.submitQuest(pending, 'sample'), true); assert.equal(D.submitQuest(pending, 'ledger'), true);
});

test('raid task tracking explains unmet prerequisites even when all materials are carried', () => {
    const save = D.newSave(); D.addItem(save.safe, 'sample');
    const loadout = D.beginRun(save, 42), progress = questProgress(save, loadout).find(q => q.key === 'sample')!;
    assert.deepEqual(progress.requirements, ['先完成「让灯亮起来」', '累计成功撤离 0 / 3 次']);
    assert.equal(progress.needs[0].carried, 1);
});
