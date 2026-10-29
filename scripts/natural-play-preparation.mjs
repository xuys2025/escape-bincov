import * as D from '../src/domain.ts';
import { derivedLimits } from '../src/expansion-state.ts';
import { useRpgItemResult } from '../src/rpg.ts';
import { shopQuote } from '../src/shop.ts';
import { placeAt, clickSlot } from './inventory-actions.mjs';
import { NATURAL_PREPARATION_POLICY as policy, assessPreparation, confirmSupplyUse } from './natural-play-policy.mjs';

const medical = new Set(['medkit', 'bandage']);
const sources = ['bag', 'stash', 'safe'];
const entries = record => sources.flatMap(source => record.profile[source].items.map(item => ({ ...item, source })));
const count = (inv, id) => inv.items.filter(i => i.id === id).reduce((n, i) => n + i.qty, 0);
const ownedCount = (record, id) => entries(record).filter(i => i.id === id).reduce((n, i) => n + i.qty, 0);

/** Native loot placement uses this instance's current footprint, including the magazine and rotation. */
export function naturalLootDestination(inv, item) {
  const stack = inv.items.find(other => other.id === item.id && !!other.relief === !!item.relief
    && other.qty + item.qty <= D.ITEMS[item.id].stack);
  if (stack) return { x: stack.x, y: stack.y };
  for (let y = 0; y < inv.h; y++) for (let x = 0; x < inv.w; x++)
    if (D.fits(inv, item, x, y, undefined, !!item.rotated)) return { x, y };
  return null;
}

/** Bot trading policy: fund supplies from ordinary materials/valuables, keeping food, medicine, guns, ammo and the safe. */
export function preparationSale(record, source = null) {
  return entries(record).filter(i => i.source !== 'safe' && (!source || i.source === source)
    && ['part', 'valuable', 'accessory', 'attachment'].includes(D.ITEMS[i.id].kind))
    .map(item => ({ ...item, price: shopQuote('stash', item).total }))
    .filter(i => i.price > 0 && D.itemSize(i).w <= 4 && D.itemSize(i).h <= 3)
    .sort((a, b) => b.price - a.price || a.uid.localeCompare(b.uid))[0] ?? null;
}

/** Cached committed SessionRecord only: no backup candidate, clock advance, persistence or game mutation. */
export function readCommittedPreparation() {
  const { app, saveSession } = window.__bincov, record = saveSession.currentRecord();
  const same = (a, b) => {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    const ak = Object.keys(a).filter(k => a[k] !== undefined).sort(), bk = Object.keys(b).filter(k => b[k] !== undefined).sort();
    return ak.length === bk.length && ak.every((key, i) => key === bk[i] && same(a[key], b[key]));
  };
  const profile = p => p && ({ cash: p.cash, equipment: p.equipment, bag: p.bag, stash: p.stash, safe: p.safe, activeRun: p.activeRun });
  const publishedMatches = !!record && same(profile(app.save), profile(record.profile))
    && same(app.expansion?.body, record.expansion?.body) && same(app.expansion?.growth, record.expansion?.growth)
    && same(app.expansion?.charm, record.expansion?.charm);
  return { phase: app.state, storageOK: app.storageOK, conflict: app.conflict, pending: !!app.pendingSettlement,
    confirmed: !!record && record.revision === saveSession.revision && publishedMatches, publishedMatches, record };
}
export function preparationFacts(read) {
  const r = read.record, p = r.profile, body = r.expansion.body, gun = D.equippedWeapon(p.equipment);
  const used = p.bag.items.reduce((n, i) => { const size = D.itemSize(i); return n + size.w * size.h; }, 0);
  return { ...read, record: undefined, revision: r.revision, activeRun: !!p.activeRun || !!r.expansion.raid,
    hp: body.hp, hpMax: derivedLimits(r.expansion).hp, bleeding: body.bleeding, stamina: body.stamina,
    mental: body.mental, water: body.water, satiety: body.satiety, pollution: body.pollution, cash: p.cash,
    bagMedical: p.bag.items.filter(i => medical.has(i.id)).reduce((n, i) => n + i.qty, 0),
    gunReady: !!p.equipment.weapon && !!gun.ammo, ammoId: gun.ammo,
    totalRounds: gun.ammo ? p.equipment.ammo + count(p.bag, gun.ammo) : 0,
    spareCells: p.bag.w * p.bag.h - used, quantities: Object.fromEntries(entries(r).map(i => [i.uid, i.qty])) };
}

/** Bounded kit/bandage preparation only. Quote official effects on a private clone, never on the game. */
export function medicalPreparationPlan(record) {
  const initial = entries(record).filter(i => medical.has(i.id)).map(i => ({ ...i })), seen = new Map();
  let best = { cost: Infinity, steps: Infinity, next: null };
  function search(trial, stock, actions, cost, depth) {
    if (cost > best.cost) return;
    if (trial.body.hp >= policy.readyHp && !trial.body.bleeding) {
      const plan = [...actions];
      if (!stock.some(i => i.qty)) { cost += D.ITEMS.bandage.buy; plan.push({ kind: 'buy', id: 'bandage' }); }
      if (!plan.length && !record.profile.bag.items.some(i => medical.has(i.id))) {
        const item = stock.find(i => i.qty); plan.push({ kind: 'pack', uid: item.uid, source: item.source, id: item.id });
      }
      if (cost < best.cost || cost === best.cost && plan.length < best.steps) best = { cost, steps: plan.length, next: plan[0] ?? null };
      return;
    }
    if (depth >= 6) return;
    const key = JSON.stringify([trial.body, stock.map(i => i.qty), depth]), old = seen.get(key);
    if (old && (old.cost < cost || old.cost === cost && old.steps <= actions.length)) return;
    seen.set(key, { cost, steps: actions.length });
    for (const id of medical) {
      const next = structuredClone(trial); if (!useRpgItemResult(next, id).ok) continue;
      const index = stock.findIndex(i => i.id === id && i.qty > 0);
      if (index >= 0) {
        const remaining = stock.map(i => ({ ...i })), item = remaining[index]; item.qty--;
        search(next, remaining, [...actions, { kind: 'use', uid: item.uid, source: item.source, id }], cost, depth + 1);
      }
      // Buying may preserve the last owned bandage as the required carried reserve.
      search(next, stock, [...actions, { kind: 'buy', id }, { kind: 'use-purchased', id }], cost + D.ITEMS[id].buy, depth + 1);
    }
  }
  search(structuredClone(record.expansion), initial, [], 0, 0);
  return best;
}

export class PreparationBlocked extends Error {
  constructor(reason, facts) { super(`Natural preparation blocked: ${reason}`); this.reason = reason; this.facts = facts; }
}
const ensureCommitted = read => {
  if (!read.record || !read.confirmed || !read.storageOK || read.conflict || read.pending || read.phase !== 'hideout')
    throw new PreparationBlocked('unconfirmed-or-unwritable-base', read.record ? preparationFacts(read) : { ...read, record: undefined });
};

/** Every action is a real visible UI action followed by a fresh successful committed-state observation. */
export async function prepareNaturalLoadout(page, decisions, run) {
  const action = (name, id) => page.locator(`[data-action="${name}"]${id ? `[data-id="${id}"]` : ''}`);
  const read = async () => { const value = await page.evaluate(readCommittedPreparation); ensureCommitted(value); return value; };
  let current = await read();
  const recordStep = (kind, reason, before, after) => decisions.push({ run, at: new Date().toISOString(), kind, reason, before: preparationFacts(before), after: after ? preparationFacts(after) : undefined });
  const perform = async (kind, reason, fn, verify) => {
    const before = current; await fn();
    const after = await read();
    if (after.record.revision <= before.record.revision || !verify(before, after))
      throw new PreparationBlocked(`${kind}-commit-not-observed`, preparationFacts(after));
    recordStep(kind, reason, before, after); current = after;
  };
  const fund = async required => {
    for (let step = 0; current.record.profile.cash < required && step < 24; step++) {
      const sale = preparationSale(current.record);
      if (!sale) throw new PreparationBlocked('no-tradable-loot-for-preparation', { ...preparationFacts(current), required });
      if (sale.source === 'bag') {
        await action('tab', 'gear').click();
        await perform('unpack-sale', 'fund-supplies-with-loot', () => page.locator(`[data-source="bag"][data-uid="${sale.uid}"]`).dblclick(), (a, b) =>
          ownedCount(a.record, sale.id) === ownedCount(b.record, sale.id)
          && count(b.record.profile.stash, sale.id) > count(a.record.profile.stash, sale.id));
        continue;
      }
      await action('tab', 'arms').click();
      await page.locator(`[data-source="stash"][data-uid="${sale.uid}"]`).click();
      await action('place-item').click(); await clickSlot(page, 'sell', 0, 0);
      const quote = await page.locator('.shop-checkout strong').innerText();
      if (!quote.startsWith('可得') || Number(quote.replace(/[^0-9]/g, '')) !== sale.price)
        throw new PreparationBlocked('changed-sale-quote', { ...preparationFacts(current), id: sale.id, quote });
      await perform('sell-loot', 'fund-supplies-with-loot', async () => {
        await action('checkout').click();
        if (await action('checkout-confirm').isVisible()) await action('checkout-confirm').click();
      }, (a, b) => b.record.profile.cash - a.record.profile.cash === sale.price
        && ownedCount(a.record, sale.id) - ownedCount(b.record, sale.id) === sale.qty);
    }
    if (current.record.profile.cash < required)
      throw new PreparationBlocked('funding-action-limit', { ...preparationFacts(current), required });
  };
  const buy = async id => {
    const expected = D.ITEMS[id].buy * D.buyQuantity(id);
    await fund(expected);
    const before = current;
    await action('tab', medical.has(id) ? 'med' : 'arms').click(); await placeAt(page, 'merchant', id, 'buy');
    const quote = await page.locator('.shop-checkout strong').innerText();
    const price = Number(quote.replace(/[^0-9]/g, ''));
    if (price !== expected || price > before.record.profile.cash)
      throw new PreparationBlocked('unaffordable-or-changed-cart-quote', { ...preparationFacts(before), id, price, expected });
    await perform('checkout', `buy-${id}`, () => action('checkout').click(), (a, b) =>
      // Official checkout may also grant eligible relief supplies; read them rather than assuming only the purchase exists.
      a.record.profile.cash - b.record.profile.cash === price && ownedCount(b.record, id) - ownedCount(a.record, id) >= D.buyQuantity(id));
  };
  // Returned trading goods belong at the base before another raid can lose them. Do not wait for a cash shortfall.
  for (let step = 0; step < 30; step++) {
    const loot = preparationSale(current.record, 'bag');
    if (!loot) break;
    await action('tab', 'gear').click();
    await perform('bank-loot', 'keep-returned-trading-goods', () => page.locator(`[data-source="bag"][data-uid="${loot.uid}"]`).dblclick(), (a, b) =>
      ownedCount(a.record, loot.id) === ownedCount(b.record, loot.id)
      && count(b.record.profile.stash, loot.id) - count(a.record.profile.stash, loot.id) === loot.qty);
  }
  for (let step = 0; step < 24; step++) {
    const facts = preparationFacts(current), assessment = assessPreparation(facts), plan = medicalPreparationPlan(current.record);
    recordStep('decision', assessment.reason, current);
    if (assessment.ready) { await action('tab', 'gear').click(); return facts; }
    if (plan.cost > facts.cash) { await fund(plan.cost); continue; }
    if (plan.next) {
      const next = plan.next;
      if (next.kind === 'buy') { await buy(next.id); continue; }
      await action('tab', 'gear').click();
      const item = page.locator(`[data-source="${next.source}"][data-uid="${next.uid}"]`);
      if (next.kind === 'use') {
        await item.click();
        await perform('use-base', 'recover-before-ammo', () => action('use-base').click(), (a, b) =>
          confirmSupplyUse(preparationFacts(a), preparationFacts(b), next.uid).committed);
      } else {
        await perform('pack', 'carry-real-medical-reserve', () => item.dblclick(), (a, b) =>
          ownedCount(a.record, next.id) === ownedCount(b.record, next.id)
          && count(b.record.profile[next.source === 'safe' ? 'stash' : 'bag'], next.id) > count(a.record.profile[next.source === 'safe' ? 'stash' : 'bag'], next.id));
      }
      continue;
    }
    if (!facts.gunReady) {
      const gun = entries(current.record).find(i => Object.hasOwn(D.WEAPONS, i.id) && i.id !== 'knife');
      if (!gun) {
        const needAmmo = Math.max(0, policy.totalRounds - ownedCount(current.record, 'ammo9'));
        const minimum = D.ITEMS.pistol.buy + Math.ceil(needAmmo / D.buyQuantity('ammo9')) * D.buyQuantity('ammo9') * D.ITEMS.ammo9.buy;
        if (facts.cash < minimum) await fund(minimum);
        await buy('pistol'); continue;
      }
      await action('tab', 'gear').click(); const item = page.locator(`[data-source="${gun.source}"][data-uid="${gun.uid}"]`);
      if (gun.source === 'safe') {
        await perform('unsecure', 'move-real-gun-to-equip', () => item.dblclick(), (a, b) => b.record.profile.stash.items.some(i => i.uid === gun.uid));
      } else {
        await item.click(); await perform('equip', 'equip-real-gun', () => action('equip').click(), (a, b) => b.record.profile.equipment.weaponUid === gun.uid);
      }
      continue;
    }
    if (facts.totalRounds < policy.totalRounds) {
      const ammo = entries(current.record).find(i => i.id === facts.ammoId && i.source !== 'bag');
      if (ammo) {
        await action('tab', 'gear').click();
        await perform('pack-ammo', 'pack-matching-ammo-shortfall', () => page.locator(`[data-source="${ammo.source}"][data-uid="${ammo.uid}"]`).dblclick(), (a, b) =>
          ownedCount(a.record, ammo.id) === ownedCount(b.record, ammo.id) && count(b.record.profile[ammo.source === 'safe' ? 'stash' : 'bag'], ammo.id) > count(a.record.profile[ammo.source === 'safe' ? 'stash' : 'bag'], ammo.id));
      } else await buy(facts.ammoId);
      continue;
    }
    throw new PreparationBlocked(assessment.reason, facts);
  }
  throw new PreparationBlocked('preparation-action-limit', preparationFacts(current));
}
