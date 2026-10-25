import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import * as S from '../src/shop';
import { SaveSession, createSessionState } from '../src/session';
import { SESSION_KEY, decodeSession } from '../src/recovery-store';
import { RealHideoutRuntime } from '../src/hideout-runtime';
import { ATTACHMENTS, GUNS } from '../src/gunsmith/catalog';
import type { GunState, PartNode } from '../src/gunsmith/instance';

// Gunsmith M1-06 (docs/gunsmith/CONTRACTS.md, M0-05 gunSale): a gun is valued and sold as its body plus each installed
// part; relief components are worth nothing to the shop, and a gun holding one is refused whole with a reason, never
// stripped or destroyed. Factory guns keep exactly the prices they had. Parts are installed by hand (the workbench is M2).
const NOW = 1800000000000;
const part = (uid: string, id: string, slot: PartNode['slot'], relief = false, children: PartNode[] = []): PartNode => ({ uid, id, slot, relief, children });
const devices = { laser: false, light: false };
/** A carbine with a flash hider and the top base holding a red dot; `reliefDot` makes the dot a relief part. */
const fitted = (reliefDot = false): GunState => ({ parts: [part('p-muzzle', 'M05', 'muzzle'), part('p-base', 'A07', 'base', false, [part('p-dot', 'O03', 'top', reliefDot)])], devices });
const gunItem = (uid: string, id: string, x: number, y: number, gun: GunState = { parts: [], devices }, relief = false): D.Item =>
    ({ uid, id, qty: 1, x, y, ...(relief ? { relief: true } : {}), gun });
const sell = (...ids: string[]) => ids.reduce((n, id) => n + ATTACHMENTS[id].sell, 0);
const REFUSED_WHOLE = '这把枪装有救济配件，不能整枪出售。';

test('factory guns keep their old prices; a fitted gun is its body plus each part; relief components are worth nothing', () => {
    for (const id of ['pistol', 'shotgun', 'carbine']) {
        assert.deepEqual(D.itemSale(gunItem('g', id, 0, 0)), { value: D.ITEMS[id].sell, restricted: false }, id);
        assert.equal(GUNS[id as 'pistol'].sell, D.ITEMS[id].sell, id);
        assert.deepEqual(D.itemSale(gunItem('g', id, 0, 0, undefined, true)), { value: 0, restricted: true }, `${id} relief`);
    }
    assert.deepEqual(D.itemSale(gunItem('g', 'carbine', 0, 0, fitted())), { value: D.ITEMS.carbine.sell + sell('M05', 'A07', 'O03'), restricted: false });
    assert.deepEqual(D.itemSale(gunItem('g', 'carbine', 0, 0, fitted(true))), { value: D.ITEMS.carbine.sell + sell('M05', 'A07'), restricted: true });
    // A relief body with ordinary parts: the parts keep their worth, the whole gun still cannot be sold.
    assert.deepEqual(D.itemSale(gunItem('g', 'carbine', 0, 0, fitted(), true)), { value: sell('M05', 'A07', 'O03'), restricted: true });
    // Everything else is valued exactly as before.
    for (const [id, qty, relief] of [['ammo9', 30, false], ['ammo9', 12, true], ['watch', 1, false], ['scrap', 4, false]] as const)
        assert.deepEqual(D.itemSale({ id, qty, relief }), { value: relief ? 0 : D.ITEMS[id].sell * qty, restricted: relief });
});

test('settlement counts a fitted gun with its parts, in the bag and in hand; a relief part counts nothing', () => {
    const value = (outcome: D.Outcome, slot: GunState, bagGun: GunState, reliefSlot = false) => {
        const save = D.newSave(); save.bag.items = []; save.safe.items = [];
        save.equipment = { weapon: 'carbine', weaponUid: 'eq-carbine', gun: slot, relief: reliefSlot, ammo: 0, ammoRelief: 0 };
        save.bag.items = [gunItem('bag-carbine', 'carbine', 0, 0, bagGun)];
        const loadout = D.beginRun(save, 7); return D.settleRun(save, loadout, outcome, 0)!;
    };
    const factory = { parts: [], devices };
    assert.deepEqual([value('extract', factory, factory).keptValue, value('death', factory, factory).lostValue], [2 * D.ITEMS.carbine.sell, 2 * D.ITEMS.carbine.sell], 'factory guns: as before');
    const full = 2 * D.ITEMS.carbine.sell + 2 * sell('M05', 'A07', 'O03');
    assert.deepEqual([value('extract', fitted(), fitted()).keptValue, value('timeout', fitted(), fitted()).lostValue], [full, full]);
    assert.equal(value('extract', fitted(true), fitted(true)).keptValue, full - 2 * ATTACHMENTS.O03.sell);
    assert.equal(value('death', fitted(), factory, true).lostValue, D.ITEMS.carbine.sell + sell('M05', 'A07', 'O03'), 'a relief body counts nothing, its parts do');
});

test('the shop quotes a fitted gun by its parts, refuses a gun holding a relief part with its reason, and sells the whole gun', () => {
    const save = D.newSave(); save.stash.items = [gunItem('s-fitted', 'carbine', 0, 0, fitted()), gunItem('s-marked', 'carbine', 0, 1, fitted(true)),
        gunItem('s-relief', 'pistol', 0, 2, undefined, true)]; save.bag.items = []; save.safe.items = []; save.cash = 100;
    const c = S.createCart(save, 'arms'), before = structuredClone(save);
    assert.deepEqual(S.shopQuote('stash', c.stash.items[0]), { side: 'sell', total: D.ITEMS.carbine.sell + sell('M05', 'A07', 'O03') });
    assert.deepEqual(S.shopQuote('stash', c.stash.items[1]), { side: 'sell', total: null });
    assert.equal(S.shopPlacementError(c, 'stash', 'sell', 's-marked', 0, 0), REFUSED_WHOLE);
    assert.equal(S.shopPlacementError(c, 'stash', 'sell', 's-relief', 0, 0), '这件物品不可出售。');
    assert.equal(S.moveShopItem(c, 'stash', 'sell', 's-marked', 0, 0), false);
    // Buying a gun is unchanged: the merchant's factory gun at its old price, delivered as a new factory instance.
    assert.deepEqual(S.shopQuote('merchant', c.catalog.items.find(i => i.id === 'carbine')!), { side: 'buy', total: D.ITEMS.carbine.buy });
    // A gun holding a relief part smuggled onto the sell list still cannot be sold: the whole settlement is refused.
    const smuggled = structuredClone(c); const marked = smuggled.stash.items.find(i => i.uid === 's-marked')!;
    smuggled.stash.items = smuggled.stash.items.filter(i => i !== marked); smuggled.sell.items.push({ ...marked, x: 0, y: 0 });
    assert.deepEqual(S.settleCartResult(save, smuggled), { ok: false, reason: 'rule' }); assert.deepEqual(save, before);
    // A part swapped behind the cart's back (a state that is not the stored one) is refused too.
    const swapped = structuredClone(c); swapped.stash.items.find(i => i.uid === 's-fitted')!.gun = { parts: [], devices };
    assert.deepEqual(S.settleCartResult(save, swapped), { ok: false, reason: 'rule' }); assert.deepEqual(save, before);
    // The fitted gun sells whole: body and parts paid once, and it leaves with every part.
    assert.ok(S.moveShopItem(c, 'stash', 'sell', 's-fitted', 0, 0));
    assert.deepEqual(S.cartTotals(c), { buy: 0, sell: D.ITEMS.carbine.sell + sell('M05', 'A07', 'O03'), net: -(D.ITEMS.carbine.sell + sell('M05', 'A07', 'O03')) });
    assert.ok(S.settleCartResult(save, c).ok);
    assert.equal(save.cash, 100 + D.ITEMS.carbine.sell + sell('M05', 'A07', 'O03'));
    assert.deepEqual(save.stash.items.map(i => i.uid).sort(), ['s-marked', 's-relief']);
    assert.deepEqual(save.stash.items.find(i => i.uid === 's-marked')!.gun, fitted(true), 'the refused gun keeps every part');
});

test('the yard shop shows the reason, keeps the refused gun whole and writes nothing', () => {
    const data = new Map<string, string>(), storage: D.StorageLike = { getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } };
    const state = createSessionState(), saves = new SaveSession(state, () => storage, undefined, () => NOW);
    assert.ok(saves.initialize()); const yard = new RealHideoutRuntime(state, saves, () => NOW); assert.ok(yard.enter().ok);
    const ticket = saves.prepareExpansionMutation(d => { d.profile.stash.items.push(gunItem('y-marked', 'carbine', 7, 5, fitted(true))); });
    assert.ok(ticket); assert.equal(saves.commitExpansionMutation(ticket), 'committed');
    const raw = data.get(SESSION_KEY), shop = yard.openShop('arms');
    assert.equal(shop.placementError('stash', 'sell', 'y-marked', 0, 0), REFUSED_WHOLE);
    assert.deepEqual(shop.place('stash', 'sell', 'y-marked', 0, 0), { ok: false, reason: 'rule', message: REFUSED_WHOLE });
    assert.equal(data.get(SESSION_KEY), raw);
    assert.deepEqual(decodeSession(data.get(SESSION_KEY)!).profile.stash.items.find(i => i.uid === 'y-marked')!.gun, fitted(true));
});

test('relief is judged by what the shop would pay now: a gun barred by a relief part counts nothing, a fitted one counts its parts', () => {
    const broke = (stashGun?: D.Item) => {
        const save = D.newSave(); save.cash = 0; save.stash.items = stashGun ? [stashGun] : []; save.bag.items = []; save.safe.items = [];
        save.equipment = { weapon: null, weaponUid: null, gun: null, relief: false, ammo: 0, ammoRelief: 0 }; return save;
    };
    assert.equal(D.liquidValue(broke()), 0);
    assert.equal(D.liquidValue(broke(gunItem('g', 'carbine', 0, 0, fitted(true)))), 0, 'cannot be sold whole now');
    assert.equal(D.liquidValue(broke(gunItem('g', 'carbine', 0, 0, fitted()))), D.ITEMS.carbine.sell + sell('M05', 'A07', 'O03'));
    assert.equal(D.liquidValue(broke(gunItem('g', 'pistol', 0, 0))), D.ITEMS.pistol.sell, 'a factory gun: as before');
});
