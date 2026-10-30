/**
 * #28 M4-04: twenty raids in a row, many times over, on the game's own deploy, raid state, settlement, quests, stash
 * and workbench code, played by fixed habits (HABITS below). It counts what PLAN section 10 asks for: running out of
 * ammunition, parts piling up unused, and how far the radio quests get; and the cash a raid brings home, for M4-03.
 *
 * The raid itself is not played in real time: each loot spot is searched, and each enemy fought, with a fixed chance;
 * a fight spends the rounds the gun needs at a fixed hit rate and may kill the player. Those numbers are assumptions,
 * written down in HABITS and the report, not measurements of anyone's play.
 *
 *   node --import tsx scripts/economy-sample.ts [--campaigns=40] [--runs=20] [--parts=1] [--late-shelf=on] [--out=report.json]
 *
 * Two what-ifs for M4-03, for this sample only: `--parts=2` prices every attachment at twice its buy and sell price;
 * `--late-shelf=off` leaves the late shelf of rare parts (D.lateParts) unbought, as before the maintainer chose it.
 */
import { writeFileSync } from 'node:fs';
import * as D from '../src/domain';
import { createSessionState, SaveSession } from '../src/session';
import { damageLayerEnemy } from '../src/layer-transition';
import { ATTACHMENTS, partTier, type GunId } from '../src/gunsmith/catalog';
import { checkInstall } from '../src/gunsmith/compat';
import { planGunEdit } from '../src/gunsmith/edit';
import { buildOf, nodesOf } from '../src/gunsmith/instance';
import { merchantStock } from '../src/shop';
import { buildFacility, FACILITY_COSTS } from '../src/base';
import { craftPremium, premiumBases, premiumBlanks, premiumLock, premiumPrice, PREMIUM_BLANK, PREMIUM_IDS } from '../src/gunsmith/premium';

const arg = (name: string, fallback: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const CAMPAIGNS = Number(arg('campaigns', '40')), RUNS = Number(arg('runs', '20')), OUT = arg('out', ''), PARTS = Number(arg('parts', '1')),
    LATE = arg('late-shelf', 'on') !== 'off';
/** Each part's tier by its catalog price, read before any what-if price change. */
const TIER = new Map(Object.values(ATTACHMENTS).map(a => [a.id, partTier(a)]));
if (PARTS !== 1) for (const a of Object.values(ATTACHMENTS)) for (const def of [a, D.ITEMS[a.id]] as { buy: number; sell: number }[]) {
    def.buy = Math.round(def.buy * PARTS); def.sell = Math.round(def.sell * PARTS);
}

/** The player's habits and the raid model: every assumption the sample rests on. */
export const HABITS = {
    /** Chance to search each ground pile or crate, and to fight each enemy (a raid holds about 25, ~70 hp each); a needed quest item is sought harder. */
    search: .5, fight: .3, questSearch: .8,
    /** Share of rounds that hit; a fight that needs more rounds than are carried is broken off (the player runs dry). */
    hit: .5,
    /** Chance a fight kills the player, doubled with no bandage or medkit left; a fight uses a bandage half the time. */
    death: .025, bandage: .5,
    /** Rounds taken along: enough for this many kills of a 70 hp enemy at the hit rate, and at least a magazine. Meds likewise. */
    kills: 10, bandages: 3, medkits: 1,
    /** Cash kept back before buying a gun or a part. */
    reserve: 600,
} as const;

const NOW = 1800000000000;
type Session = ReturnType<typeof createSessionState>;
interface RunRow {
    run: number; world: 'street' | 'mall'; outcome: D.Outcome; kills: number; dry: boolean; short: boolean; brought: number; rare: number; hand: string; handRare: number;
    cash: number; worth: number; gun: string; parts: number; loose: number; idle: number; looseValue: number;
    stashUse: number; idleSold: number; ammoBought: number; ammoFound: number; ammoUsed: number; spentParts: number; spentGuns: number;
    quests: string[];
    /** 老栓精工 (#28 M4-09): blanks brought home this raid, the workbench level, premium parts made so far and on the gun. */
    blanks: number; workbench: number; made: number; handPremium: number;
}

function campaign(index: number): RunRow[] {
    const data = new Map<string, string>(), storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
    const state = createSessionState(), saves = new SaveSession(state, () => storage, undefined, () => NOW);
    if (!saves.initialize()) throw Error(state.storageError!);
    state.state = 'hideout';
    if (!saves.enableRpg()) throw Error('rpg');
    const random = D.seededRandom(0x4d340004 + index * 977), rows: RunRow[] = [];
    let made = 0;
    for (let run = 1; run <= RUNS; run++) {
        const spent = base(state);
        made += spent.made;
        const hand = state.save.equipment.weapon ?? '-', handNodes = state.save.equipment.gun ? nodesOf(state.save.equipment.gun.parts) : [];
        const handParts = handNodes.length, handRare = handNodes.filter(n => TIER.get(n.id) === 'rare').length, handPremium = handNodes.filter(n => TIER.get(n.id) === 'premium').length;
        const world = random() < .5 ? 'street' as const : 'mall' as const, seed = index * 1000 + run;
        if (!saves.beginRun(seed, world === 'mall' ? 'mall' : true, world === 'mall' ? { mallLayout: 4 } : {})) throw Error(`deploy ${index}/${run}: ${D.deployBlocker(state.save) ?? state.storageError}`);
        const raid = play(state, random);
        state.state = 'run';
        if (!saves.prepareSettlement(raid.outcome, raid.kills) || !saves.retrySettlement()) throw Error(`settle ${index}/${run}: ${state.storageError}`);
        state.state = 'hideout';
        const save = state.save, held = owned(save);
        const loose = [save.stash, save.bag, save.safe].flatMap(inv => inv.items).filter(i => Object.hasOwn(ATTACHMENTS, i.id));
        rows.push({
            run, world, outcome: raid.outcome, kills: raid.kills, dry: raid.dry, short: spent.short, brought: raid.outcome === 'extract' ? raid.brought : 0,
            rare: raid.outcome === 'extract' ? raid.rare : 0, hand, handRare,
            cash: save.cash, worth: worth(save), gun: save.equipment.weapon ?? '-', parts: handParts,
            loose: loose.length, idle: loose.filter(i => !held.some(g => fitsGun(g, i.id))).length,
            looseValue: loose.reduce((n, i) => n + D.itemSale(i).value, 0),
            stashUse: stashUse(save), idleSold: spent.idleSold,
            ammoBought: spent.ammo, ammoFound: raid.found, ammoUsed: raid.used, spentParts: spent.parts, spentGuns: spent.guns,
            quests: Object.keys(save.quests).filter(k => save.quests[k]),
            blanks: raid.outcome === 'extract' ? raid.blanks : 0, workbench: state.expansion!.base.facilities.workbench, made, handPremium,
        });
    }
    return rows;
}

/** Every gun the player holds at the base: equipped first, then stash and bag. */
function owned(save: D.SaveDataV1): GunId[] {
    return [save.equipment.weapon, ...[save.stash, save.bag].flatMap(inv => inv.items).map(i => i.id)].filter((id): id is GunId => !!id && D.isGun(id));
}
const fitsGun = (gun: GunId, part: string) => checkInstall({ gun, parts: [] }, part).ok;
const worth = (save: D.SaveDataV1) => save.cash + [save.stash, save.bag, save.safe].flatMap(inv => inv.items).reduce((n, i) => n + D.itemSale(i).value, 0)
    + (save.equipment.weapon && D.isGun(save.equipment.weapon) && !save.equipment.relief ? D.itemSale({ id: save.equipment.weapon, qty: 1, relief: false, gun: save.equipment.gun }).value : 0);
const value = (i: D.Item) => D.itemSale(i).value;
const stashUse = (save: D.SaveDataV1) => save.stash.items.reduce((n, i) => { const s = D.itemSize(i); return n + s.w * s.h; }, 0) / (save.stash.w * save.stash.h);

/** The base between raids: quests, stash, the best gun and its parts, selling, then shopping. Returns what it spent. */
function base(state: Session) {
    let save = state.save;
    const spent = { ammo: 0, parts: 0, guns: 0, short: false, idleSold: 0, made: 0 };
    for (const id of Object.keys(D.QUESTS)) D.submitQuest(save, id);
    if (save.quests.repair && !save.upgraded && save.cash >= D.STASH_UPGRADE_COST + HABITS.reserve) D.upgradeStash(save);
    // The workbench, a level at a time, once the power is back and the cash and the repair parts are there (M4-09's orders need level 3).
    const bench = state.expansion!.base.facilities.workbench, cost = FACILITY_COSTS.workbench[bench];
    if (cost && save.quests.repair && save.cash >= cost.cash + HABITS.reserve) buildFacility(save, state.expansion!, 'workbench');
    // Unpack the bag into the stash; what does not fit is sold.
    for (const item of [...save.bag.items]) {
        save.bag.items.splice(save.bag.items.indexOf(item), 1);
        if (!D.placeItem(save.stash, item)) sell(save, item);
    }
    // The best gun goes in hand (by what it would sell for), the next best stays as a spare, other guns are sold.
    const guns = save.stash.items.filter(i => D.isGun(i.id) && !i.relief).sort((a, b) => value(b) - value(a));
    const hand = save.equipment.weapon && D.isGun(save.equipment.weapon) && !save.equipment.relief
        ? D.itemSale({ id: save.equipment.weapon, qty: 1, relief: false, gun: save.equipment.gun }).value : -1;
    if (guns[0] && value(guns[0]) > hand) D.equip(save, guns[0].uid);
    const spare = save.stash.items.filter(i => D.isGun(i.id) && !i.relief).sort((a, b) => value(b) - value(a));
    for (const item of spare.slice(1)) sell(save, item);
    // Valuables are sold, and so are the items of quests already done.
    const wanted = neededQuestItems(save);
    for (const item of save.stash.items.filter(i => !i.relief && (D.ITEMS[i.id].kind === 'valuable' || D.ITEMS[i.id].kind === 'quest' && !wanted.has(i.id)))) sell(save, item);
    save = state.save = fit(save);
    // Past 70% full the clutter goes, in this order, until 60%: rounds no gun of the player's fires, repair parts no open
    // quest needs, food and water past two each, then parts that fit none of the player's guns.
    const kept = owned(save), fires = new Set(kept.map(g => D.WEAPONS[g].ammo));
    const clutter: ((i: D.Item) => boolean)[] = [
        i => D.ITEMS[i.id].kind === 'ammo' && !fires.has(i.id),
        i => D.ITEMS[i.id].kind === 'part' && !wanted.has(i.id) && i.id !== PREMIUM_BLANK && !workbenchNeeds(state).has(i.id),
        i => (i.id === 'food' || i.id === 'water') && D.count(save.stash, i.id) > 2,
        i => Object.hasOwn(ATTACHMENTS, i.id) && !kept.some(g => fitsGun(g, i.id)),
    ];
    if (stashUse(save) > .7) for (const rule of clutter) for (const item of save.stash.items.filter(i => !i.relief && rule(i))) {
        if (stashUse(save) <= .6) break;
        if (Object.hasOwn(ATTACHMENTS, item.id)) spent.idleSold++;
        sell(save, item);
    }
    // Shopping: ammunition and meds first, then a better gun from the counter, then parts for free slots.
    const stock = merchantStock('arms', save, true), had = save.equipment.weapon;
    const current = had && D.isGun(had) && !save.equipment.relief ? D.ITEMS[had].buy : 0;
    // With no gun at all the cheapest one is bought whatever the reserve.
    const better = current || had ? stock.filter(id => D.isGun(id) && D.ITEMS[id].buy > current && save.cash >= D.ITEMS[id].buy + HABITS.reserve).sort((a, b) => D.ITEMS[b].buy - D.ITEMS[a].buy)[0]
        : stock.filter(id => D.isGun(id) && save.cash >= D.ITEMS[id].buy).sort((a, b) => D.ITEMS[a].buy - D.ITEMS[b].buy)[0];
    if (better && !D.addItem(save.stash, better, 1)) {
        save.cash -= D.ITEMS[better].buy; spent.guns += D.ITEMS[better].buy;
        const item = save.stash.items.find(i => i.id === better && !i.gun?.parts.length)!;
        D.equip(save, item.uid);
        save = state.save = fit(save);
    }
    const gun = save.equipment.weapon, ammo = gun && D.isGun(gun) ? D.WEAPONS[gun].ammo : null;
    if (ammo) {
        const w = D.equippedWeapon(save.equipment), want = Math.max(w.magazine, HABITS.kills * Math.ceil(70 / Math.max(1, w.damage * Math.max(1, w.pellets) * HABITS.hit)));
        while (D.count(save.stash, ammo) + D.count(save.bag, ammo) < want) {
            const pack = D.buyQuantity(ammo), cost = pack * D.ITEMS[ammo].buy;
            if (save.cash < cost) { spent.short = true; break; }
            if (D.addItem(save.stash, ammo, pack)) break;
            save.cash -= cost; spent.ammo += cost;
        }
    }
    for (const [id, want] of [['bandage', HABITS.bandages], ['medkit', HABITS.medkits]] as const) {
        while (D.count(save.stash, id) + D.count(save.bag, id) < want && save.cash >= D.ITEMS[id].buy && !D.addItem(save.stash, id, 1)) save.cash -= D.ITEMS[id].buy;
    }
    // Parts from the counter at its price, the late shelf's rare ones first: each in place of a cheaper one, or on a free slot.
    const late = LATE && save.quests[D.LATE_QUEST] ? D.lateParts(save.stats.runs) : [];
    if (gun && D.isGun(gun)) for (const id of [...late, ...stock.filter(id => Object.hasOwn(ATTACHMENTS, id) && TIER.get(id) !== 'rare')]) {
        const price = D.ITEMS[id].buy;
        if (save.cash < price + HABITS.reserve || !swap(save, id)) continue;
        if (D.addItem(save.stash, id, 1)) continue;
        save.cash -= price; spent.parts += price;
        save = state.save = fit(save);
    }
    // 老栓精工 (#28 M4-09): once he takes orders, a premium part for the gun in hand from a loose base, the dearest first.
    if (gun && D.isGun(gun) && !premiumLock(save, state.expansion!)) for (const id of [...PREMIUM_IDS].sort((a, b) => premiumPrice(b) - premiumPrice(a))) {
        if (premiumBlanks(save) < 1 || save.cash < premiumPrice(id) + HABITS.reserve || !premiumBases(save, id).length || !swap(save, id)) continue;
        if (craftPremium(save, state.expansion!, id)) continue;
        spent.parts += premiumPrice(id); spent.made++;
        save = state.save = fit(save);
    }
    // Pack the kit: the gun's rounds and the meds go from the stash into the bag.
    for (const id of [ammo, 'bandage', 'medkit'].filter((id): id is string => !!id)) {
        const n = D.count(save.stash, id);
        if (n && D.removeItem(save.stash, id, n)) { const left = D.addItem(save.bag, id, n); if (left) D.addItem(save.stash, id, left); }
    }
    return spent;
}
/** The repair parts the next workbench level still takes: kept through a clean-up. */
function workbenchNeeds(state: Session): Set<string> {
    const cost = FACILITY_COSTS.workbench[state.expansion!.base.facilities.workbench];
    return new Set(cost ? cost.items.map(i => i.id) : []);
}
function sell(save: D.SaveDataV1, item: D.Item) {
    for (const inv of [save.stash, save.bag]) { const at = inv.items.indexOf(item); if (at >= 0) inv.items.splice(at, 1); }
    save.cash += value(item);
}
/**
 * What putting part `id` on the equipped gun takes: nothing to remove when the gun has nothing of its category, else the
 * cheaper part of that category with nothing on it, which comes off first. Null when it would not go on, or would not
 * be better.
 */
function swap(save: D.SaveDataV1, id: string): { off: string | null } | null {
    const gun = save.equipment.gun, weapon = save.equipment.weapon;
    if (!gun || !weapon || !D.isGun(weapon) || save.equipment.relief) return null;
    const same = nodesOf(gun.parts).find(n => ATTACHMENTS[n.id]?.cat === ATTACHMENTS[id].cat);
    if (same && (same.children.length || ATTACHMENTS[same.id].buy >= ATTACHMENTS[id].buy)) return null;
    const build = buildOf({ id: weapon, parts: gun.parts, magOut: gun.magOut });
    return checkInstall({ ...build, parts: build.parts.filter(p => p.uid !== same?.uid) }, id).ok ? { off: same?.uid ?? null } : null;
}
/** The workbench: loose parts go on the equipped gun, dearest first, each in place of a cheaper one of its category. */
function fit(save: D.SaveDataV1): D.SaveDataV1 {
    const uid = save.equipment.weaponUid;
    if (!uid) return save;
    for (;;) {
        const loose = save.stash.items.filter(i => Object.hasOwn(ATTACHMENTS, i.id) && !i.relief && swap(save, i.id)).sort((a, b) => ATTACHMENTS[b.id].buy - ATTACHMENTS[a.id].buy);
        const plan = loose.map(i => { const off = swap(save, i.id)!.off; return planGunEdit(save, uid, [...off ? [{ kind: 'remove' as const, uid: off }] : [], { kind: 'install', uid: i.uid }]); }).find(p => p.ok);
        if (!plan?.ok) return save;
        save = plan.profile;
    }
}

/** One raid on the live session state: search, fight, pack the bag. */
function play(state: Session, random: () => number) {
    const e = state.expansion!, raid = e.raid!, loadout = state.loadout!;
    const weapon = D.equippedWeapon(loadout), ammo = weapon.ammo, needed = neededQuestItems(state.save);
    let kills = 0, dry = false, used = 0, found = 0, rare = 0, blanks = 0, outcome: D.Outcome = 'extract';
    const rounds = () => ammo ? loadout.ammo + D.count(loadout.bag, ammo) : 0;
    const spend = (n: number) => {
        const fromMag = Math.min(n, loadout.ammo);
        loadout.ammo -= fromMag; loadout.ammoRelief = Math.min(loadout.ammoRelief, loadout.ammo);
        if (n > fromMag) D.removeItem(loadout.bag, ammo!, n - fromMag);
        used += n;
    };
    for (const [mapId, map] of Object.entries(raid.maps)) for (const enemy of [...map.enemies]) {
        if (outcome !== 'extract' || dry || !ammo || random() >= HABITS.fight) continue;
        const per = weapon.damage * Math.max(1, weapon.pellets) * HABITS.hit, need = Math.ceil(enemy.hp / Math.max(1, per));
        if (need > rounds()) { dry = true; continue; }
        spend(need);
        const healed = D.count(loadout.bag, 'bandage') + D.count(loadout.bag, 'medkit') > 0;
        if (random() < HABITS.death * (healed ? 1 : 2)) { outcome = 'death'; break; }
        if (random() < HABITS.bandage) D.removeItem(loadout.bag, D.count(loadout.bag, 'bandage') ? 'bandage' : 'medkit', 1);
        damageLayerEnemy(e, mapId, enemy, 1e6); kills++;
    }
    // What the visited spots hold: ground piles, crates and the bodies of the enemies killed.
    const take: D.Item[] = [];
    for (const map of Object.values(raid.maps)) {
        for (const l of map.loot) {
            const quest = needed.has(l.id);
            if (random() < (quest ? HABITS.questSearch : HABITS.search)) take.push({ uid: l.uid, id: l.id, qty: l.qty, x: 0, y: 0, ...(l.relief ? { relief: true } : {}), ...(l.gun ? { gun: l.gun } : {}) });
        }
        for (const c of map.containers) if (c.kind === 'corpse' || random() < HABITS.search) take.push(...c.inventory.items);
    }
    // Quest items into the safe first, then the gun's own rounds, meds, and the rest by value per cell.
    const rank = (i: D.Item) => needed.has(i.id) || i.id === PREMIUM_BLANK ? 1e9 : i.id === ammo ? 1e8 : ['bandage', 'medkit'].includes(i.id) ? 1e7 : value(i) / Math.max(1, cells(i));
    let brought = 0;
    for (const item of take.filter(i => !i.relief).sort((a, b) => rank(b) - rank(a))) {
        const copy = structuredClone(item);
        if (D.isGun(item.id) && D.placeGroundGun(loadout.bag, { uid: item.uid, id: item.id, gun: item.gun, relief: false })) { brought += value(item); continue; }
        if (D.isGun(item.id)) continue;
        const into = (needed.has(item.id) || item.id === PREMIUM_BLANK) && D.placeItem(loadout.safe, copy) ? 'safe' : D.addItem(loadout.bag, item.id, item.qty) === 0 ? 'bag' : null;
        if (!into) continue;
        if (item.id === PREMIUM_BLANK) blanks += item.qty;
        if (item.id === ammo) found += item.qty; else if (!needed.has(item.id)) brought += value(item);
        if (Object.hasOwn(ATTACHMENTS, item.id) && TIER.get(item.id) === 'rare') rare++;
    }
    return { outcome, kills, dry, used, found, rare, blanks, brought };
}
const cells = (i: D.Item) => { const s = D.itemSize(i); return s.w * s.h; };
function neededQuestItems(save: D.SaveDataV1): Set<string> {
    return new Set(Object.entries(D.QUESTS).filter(([k]) => !save.quests[k]).flatMap(([, q]) => Object.keys(q.needs)));
}

// Run the campaigns and report the median (and the 10th and 90th percentile) at each raid.
const all = Array.from({ length: CAMPAIGNS }, (_, i) => campaign(i + 1));
const pct = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(p * (s.length - 1))]; };
const share = (xs: boolean[]) => Math.round(100 * xs.filter(Boolean).length / xs.length);
console.log(`${CAMPAIGNS} campaigns of ${RUNS} raids; habits ${JSON.stringify(HABITS)}`);
console.log(`${CAMPAIGNS} campaigns, parts priced x${PARTS}, late shelf ${LATE ? 'on' : 'off'}`);
console.log('run  extract%  dry%  brought(p10/50/90)   cash p50  worth p50  parts-on-gun  loose(idle)  stash%  quests done%(repair/sample/ledger)');
const perRun = [];
for (let r = 0; r < RUNS; r++) {
    const rows = all.map(c => c[r]);
    const line = {
        run: r + 1, extract: share(rows.map(x => x.outcome === 'extract')), dry: share(rows.map(x => x.dry)),
        brought: [.1, .5, .9].map(p => pct(rows.filter(x => x.outcome === 'extract').map(x => x.brought), p)),
        cash: pct(rows.map(x => x.cash), .5), worth: pct(rows.map(x => x.worth), .5), parts: pct(rows.map(x => x.parts), .5),
        loose: pct(rows.map(x => x.loose), .5), idle: pct(rows.map(x => x.idle), .5), stash: Math.round(100 * pct(rows.map(x => x.stashUse), .5)),
        quests: Object.keys(D.QUESTS).map(q => share(rows.map(x => x.quests.includes(q)))),
    };
    perRun.push(line);
    console.log(String(line.run).padStart(3), String(line.extract).padStart(8), String(line.dry).padStart(5), line.brought.join('/').padStart(20),
        String(line.cash).padStart(9), String(line.worth).padStart(10), String(line.parts).padStart(13), `${line.loose}(${line.idle})`.padStart(12),
        String(line.stash).padStart(7), line.quests.join('/').padStart(14));
}
const flat = all.flat(), extracts = flat.filter(x => x.outcome === 'extract');
const summary = {
    raids: flat.length, extractRate: share(flat.map(x => x.outcome === 'extract')), dryRate: share(flat.map(x => x.dry)), shortRate: share(flat.map(x => x.short)),
    broughtPerExtract: [.1, .5, .9].map(p => pct(extracts.map(x => x.brought), p)),
    ammo: { boughtPerRaid: Math.round(flat.reduce((n, x) => n + x.ammoBought, 0) / flat.length), roundsFoundPerRaid: +(flat.reduce((n, x) => n + x.ammoFound, 0) / flat.length).toFixed(1), roundsUsedPerRaid: +(flat.reduce((n, x) => n + x.ammoUsed, 0) / flat.length).toFixed(1) },
    spentPerRaid: { parts: Math.round(flat.reduce((n, x) => n + x.spentParts, 0) / flat.length), guns: Math.round(flat.reduce((n, x) => n + x.spentGuns, 0) / flat.length) },
    lastHand: Object.fromEntries([...all.reduce((m, c) => m.set(c.at(-1)!.hand, (m.get(c.at(-1)!.hand) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1])),
    lastHandParts: [.1, .5, .9].map(p => pct(all.map(c => c.at(-1)!.parts), p)),
    lastHandRare: [.1, .5, .9].map(p => pct(all.map(c => c.at(-1)!.handRare), p)),
    questsDone: Object.fromEntries(Object.keys(D.QUESTS).map(q => [q, share(all.map(c => c.at(-1)!.quests.includes(q)))])),
    questRun: Object.fromEntries(Object.keys(D.QUESTS).map(q => [q, pct(all.map(c => c.find(x => x.quests.includes(q))?.run ?? Infinity), .5)])),
    idleParts: { median: pct(all.map(c => c.at(-1)!.idle), .5), p90: pct(all.map(c => c.at(-1)!.idle), .9), soldPer20: +(flat.reduce((n, x) => n + x.idleSold, 0) / CAMPAIGNS * 20 / RUNS).toFixed(1) },
    rareBroughtPer20: +(all.reduce((n, c) => n + c.reduce((m, x) => m + x.rare, 0), 0) / CAMPAIGNS * 20 / RUNS).toFixed(2),
    premium: {
        blanksBroughtPer20: +(all.reduce((n, c) => n + c.reduce((m, x) => m + x.blanks, 0), 0) / CAMPAIGNS * 20 / RUNS).toFixed(2),
        workbench3By: pct(all.map(c => c.find(x => x.workbench >= 3)?.run ?? Infinity), .5),
        madeBy20: [.1, .5, .9].map(p => pct(all.map(c => c.at(-1)!.made), p)),
        onGunAt20: [.1, .5, .9].map(p => pct(all.map(c => c.at(-1)!.handPremium), p)),
    },
};
console.log(JSON.stringify(summary, null, 1));
if (OUT) writeFileSync(OUT, JSON.stringify({ habits: HABITS, campaigns: CAMPAIGNS, runs: RUNS, parts: PARTS, lateShelf: LATE, perRun, summary }, null, 1) + '\n');
