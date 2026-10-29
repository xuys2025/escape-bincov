import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import * as Shop from '../src/shop';
import { ATTACHMENTS, GUNS, partTier, type GunId } from '../src/gunsmith/catalog';
import { decodeStoredProfile } from '../src/profile-codec';

// #28 M4-01 (maintainer 2026-10-29, #139): 老栓's guns come with the radio quests, the rare guns are never stocked, the
// basic parts are steady stock and the common parts rotate with every deployment. Rules in docs/gunsmith/CONTRACTS.md,
// 「老栓按进度供货（M4-01）」.

const START = ['pistol', 'shotgun', 'carbine', 'gb17', 'pb226', 'mb870', 'mpb5', 'mb1911'];
const RARE_GUNS = (Object.keys(GUNS) as GunId[]).filter(id => GUNS[id].tier === 'rare');
const guns = (save: D.SaveDataV1) => D.armsStock(save).filter(id => D.isGun(id));
const withQuests = (...done: string[]) => { const s = D.newSave(); for (const q of done) s.quests[q] = true; return s; };
/** The common parts that are found (PLAN section 10), in item order: every common catalog part but the G17's two on the steady shelf. */
const COMMON_FOUND = Object.keys(D.ITEMS).filter(id => Object.hasOwn(ATTACHMENTS, id) && partTier(ATTACHMENTS[id]) === 'common' && !D.MERCHANTS.arms.stock.includes(id));

test('the radio quests put the common guns on the shelf, one batch each; the rare guns never come', () => {
    assert.deepEqual(guns(D.newSave()), START);
    assert.deepEqual(guns(withQuests('repair')), [...START, 'umpb45', 'akb74', 'mb4a1', 'akb103']);
    assert.deepEqual(guns(withQuests('sample')), [...START, 'augb', 'rpkb']);
    assert.deepEqual(guns(withQuests('ledger')), START, 'the ledger\'s guns would all be rare: none yet');
    const all = guns(withQuests('repair', 'sample', 'ledger'));
    assert.deepEqual([...all].sort(), (Object.keys(GUNS) as GunId[]).filter(id => GUNS[id].tier !== 'rare').sort(), 'every common and entry gun');
    for (const save of [D.newSave(), withQuests('repair', 'sample', 'ledger')]) assert.ok(!guns(save).some(id => RARE_GUNS.includes(id as GunId)));
    // The quest guns sit right after the steady guns, before the rounds and the parts.
    const stock = D.armsStock(withQuests('repair', 'sample'));
    assert.deepEqual(stock.slice(stock.indexOf('mb1911') + 1, stock.indexOf('mb1911') + 7), ['umpb45', 'akb74', 'mb4a1', 'akb103', 'augb', 'rpkb']);
    // The doctor's counter does not change.
    assert.deepEqual(D.merchantGoods('med', withQuests('repair')), D.MERCHANTS.med.stock);
});

test('the rotating shelf: six common found parts in item order, the same for the same deployments, another set after one more', () => {
    for (let runs = 0; runs < 300; runs++) {
        const parts = D.rotationParts(runs);
        assert.equal(parts.length, D.ROTATION_PARTS);
        assert.deepEqual(parts, COMMON_FOUND.filter(id => parts.includes(id)), 'common found parts, in item order');
        assert.deepEqual(D.rotationParts(runs), parts, 'worked out from the count alone');
    }
    // Consecutive deployments almost always bring a different set, and every common part comes round within 100.
    let same = 0;
    for (let runs = 0; runs < 300; runs++) if (D.rotationParts(runs).join() === D.rotationParts(runs + 1).join()) same++;
    assert.ok(same < 3, `${same} repeats`);
    const seen = new Set(Array.from({ length: 100 }, (_, n) => D.rotationParts(n)).flat());
    assert.deepEqual([...seen].sort(), [...COMMON_FOUND].sort());
    // On the shelf they come last, after the steady stock.
    const save = D.newSave(); save.stats.runs = 7;
    assert.deepEqual(D.armsStock(save).slice(-D.ROTATION_PARTS), D.rotationParts(7));
});

test('a deployment turns the rotation; a reload does not', () => {
    const save = D.newSave(), before = D.armsStock(save);
    assert.deepEqual(D.armsStock(decodeStoredProfile(structuredClone(save))), before, 'the same profile read back, the same shelf');
    D.beginRun(save, 12345);
    assert.equal(save.stats.runs, 1);
    assert.deepEqual(D.armsStock(save).slice(0, -D.ROTATION_PARTS), before.slice(0, -D.ROTATION_PARTS), 'the steady stock stays');
    assert.deepEqual(D.armsStock(save).slice(-D.ROTATION_PARTS), D.rotationParts(1));
});

test('checkout takes only what is on the shelf for this profile: a quest gun after its quest, a rotating part in its rotation', () => {
    const buy = (save: D.SaveDataV1, id: string) => {
        const cart = Shop.createCart(save, 'arms');
        assert.equal(D.addItem(cart.buy, id, D.buyQuantity(id)), 0);
        return Shop.settleCartResult(save, cart);
    };
    const rich = (...done: string[]) => { const s = withQuests(...done); s.cash = 100000; return s; };
    assert.deepEqual(buy(rich(), 'mb4a1'), { ok: false, reason: 'rule' }, 'not before the repair quest');
    assert.deepEqual(buy(rich('repair'), 'mb4a1'), { ok: true });
    assert.deepEqual(buy(rich('repair', 'sample', 'ledger'), 'svdb'), { ok: false, reason: 'rule' }, 'a rare gun never');
    assert.deepEqual(buy(rich(), 'mpb5'), { ok: true }, 'the MP5 from the start');
    const inRotation = D.rotationParts(0)[0], out = COMMON_FOUND.find(id => !D.rotationParts(0).includes(id))!;
    assert.deepEqual(buy(rich(), inRotation), { ok: true });
    assert.deepEqual(buy(rich(), out), { ok: false, reason: 'rule' });
});
