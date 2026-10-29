import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import { handlingOf, type Handling } from '../src/shooting';
import { ATTACHMENTS, BRAND_NAMES, CATEGORY_NAMES, GUN_CLASS_NAMES, GUNS, SLOT_NAMES, type AttachmentDef, type Factors, type GunHandling,
    type GunId, type Modifiers } from '../src/gunsmith/catalog';
import { DOCS } from './fixtures/gunsmith-docs';

const guns = Object.values(GUNS), parts = Object.values(ATTACHMENTS);
const RAILS = new Set(['micro', 'top', 'under', 'side', 'pistolSide', 'bipod']);
/** The position a gun-listed part takes, by its ATTACHMENTS.md section (the test's own reading). */
const POSITION: Record<string, string> = {
    '枪口': 'muzzle', '枪管模块': 'barrel', '护木': 'handguard', '枪托': 'stock', '后握把': 'grip', '弹匣和供弹模块': 'mag', '基座和转接件': 'base',
};
const TIERS = { entry: '入门', common: '常规', rare: '稀有' } as const;
const tally = (keys: string[]) => keys.reduce<Record<string, number>>((out, k) => ({ ...out, [k]: (out[k] ?? 0) + 1 }), {});

test('the 20 guns follow WEAPONS.md: order, ids, names, classes, ammo groups, factory capacity and tiers', () => {
    assert.deepEqual(Object.keys(GUNS), DOCS.guns.map(g => g.id));
    for (const doc of DOCS.guns) {
        const gun = GUNS[doc.id as GunId];
        assert.equal(gun.id, doc.id); assert.equal(gun.stats.id, doc.id);
        assert.equal(gun.stats.name, doc.name);
        assert.equal(GUN_CLASS_NAMES[gun.cls], doc.cls, doc.id);
        assert.equal(gun.stats.ammo, DOCS.ammo.get(doc.ammo), doc.id);
        assert.equal(gun.stats.magazine, doc.capacity, doc.id);
        assert.equal(TIERS[gun.tier], doc.tier, doc.id);
    }
});

test('counts: guns by class 4/4/3/5/2/1/1, attachments by category 12/12/10/10/10/8/8/12/10/8; ids and names are unique', () => {
    const classes = tally(guns.map(g => GUN_CLASS_NAMES[g.cls]));
    assert.deepEqual(classes, { '手枪': 4, '冲锋枪': 4, '霰弹枪': 3, '步枪': 5, '精确步枪': 2, '栓动步枪': 1, '轻机枪': 1 });
    assert.deepEqual(classes, Object.fromEntries(DOCS.classCounts));
    const categories = tally(parts.map(a => CATEGORY_NAMES[a.cat]));
    assert.deepEqual(Object.values(categories), [12, 12, 10, 10, 10, 8, 8, 12, 10, 8]);
    assert.deepEqual(categories, Object.fromEntries(DOCS.headings));
    assert.equal(guns.length, 20); assert.equal(parts.length, 100);
    const names = [...guns.map(g => g.stats.name), ...parts.map(a => a.name)];
    assert.equal(new Set(names).size, 120);
    assert.equal(new Set(parts.map(a => a.id)).size, 100);
    for (const [id, a] of Object.entries(ATTACHMENTS)) assert.equal(a.id, id);
});

/**
 * The #39 sample rifle as the maintainer playtested it (SAMPLE_GUNS.m4a1 and its handling row in src/shooting.ts),
 * frozen here when M2-01 retired it: the real M4A1 must keep it exactly.
 */
const SAMPLE_M4A1 = {
    stats: { ammo: 'ammoR', magazine: 30, damage: 24, range: 600, cooldown: .1, reload: 2.1, pellets: 1, spread: .03, crit: .05 },
    handling: { mode: 'auto', hip: 2.4, precise: .22, raise: .4, sway: 2.2, bloom: .009, bloomMax: .08, kick: .008, kickMax: .08, settle: .15, recover: 4 },
} as const;

test('the old three equal today\'s WEAPONS, ITEMS and handling; mb4a1 keeps the #39 sample rifle\'s numbers and handling', () => {
    for (const id of ['pistol', 'shotgun', 'carbine'] as const) {
        const gun = GUNS[id], item = D.ITEMS[id];
        assert.deepEqual(gun.stats, D.WEAPONS[id]);
        assert.deepEqual(gun.handling, handlingOf(id));
        assert.deepEqual({ w: gun.w, h: gun.h, weight: gun.weight, buy: gun.buy, sell: gun.sell },
            { w: item.w, h: item.h, weight: item.weight, buy: item.buy, sell: item.sell });
    }
    const { id, name, ...stats } = GUNS.mb4a1.stats;
    assert.deepEqual([id, name, stats], ['mb4a1', 'M4A1 模块步枪', SAMPLE_M4A1.stats]);
    assert.deepEqual(GUNS.mb4a1.handling, SAMPLE_M4A1.handling);
    // GunHandling mirrors shooting.ts's Handling, which the rule module may not import: each type takes the other.
    const asHandling: Handling = GUNS.carbine.handling, asGun: GunHandling = handlingOf('carbine');
    assert.deepEqual(asHandling, asGun);
});

test('native slots follow the docs: a position wherever an attachment lists the gun, rails from the mod-entry table', () => {
    for (const doc of DOCS.guns) {
        const gun = GUNS[doc.id as GunId], slots = Object.keys(gun.slots);
        const positions = new Set(DOCS.parts.filter(p => p.guns?.includes(doc.id)).map(p => POSITION[p.heading]));
        assert.deepEqual(new Set(slots.filter(s => !RAILS.has(s))), positions, doc.id);
        assert.deepEqual(new Set(slots.filter(s => RAILS.has(s))), doc.native, doc.id);
        for (const n of Object.values(gun.slots)) assert.equal(n, 1, `${doc.id}: one of each native slot`);
        // Long-range scopes: native, or granted by a part this gun takes (A07 on the carbine).
        const granted = parts.some(a => a.grants.includes('longScope') && !!a.guns?.includes(gun.id));
        assert.equal(gun.quals.includes('longScope') || granted, DOCS.longScope.has(doc.id), doc.id);
    }
    assert.deepEqual(GUNS.carbine.quals, [], 'the carbine is qualified only through A07');
});

test('every attachment matches its ATTACHMENTS.md row: name, brand, category, slot, guns, slots it opens, prerequisites', () => {
    assert.deepEqual(Object.keys(ATTACHMENTS), DOCS.parts.map(p => p.id));
    for (const doc of DOCS.parts) {
        const a = ATTACHMENTS[doc.id];
        assert.equal(a.name, doc.name); assert.equal(BRAND_NAMES[a.brand], doc.brand, doc.id);
        assert.equal(CATEGORY_NAMES[a.cat], doc.heading, doc.id);
        assert.equal(a.mount, doc.rail ?? POSITION[doc.heading], doc.id);
        assert.deepEqual(a.guns && [...a.guns].sort(), doc.guns && [...doc.guns].sort(), doc.id);
        assert.deepEqual(a.provides, doc.provides, doc.id);
        assert.deepEqual(a.requires, doc.longScope ? ['longScope'] : [], doc.id);
        assert.deepEqual(a.grants, doc.grantsLongScope ? ['longScope'] : [], doc.id);
        const rule = DOCS.prereqs.find(r => r.part === doc.id);
        assert.deepEqual(a.needs, rule ? [{ part: rule.needs, on: rule.on }] : [], doc.id);
        assert.ok(!/[A-Za-z]{3,}/.test(SLOT_NAMES[a.mount]), 'slot names are for players');
    }
});

test('effect quotas follow the device names and the device effects', () => {
    for (const a of parts) {
        const kind = /组合器/.test(a.name) ? 'combiner' : /激光|指示器/.test(a.name) ? 'laser' : /灯/.test(a.name) ? 'light' : null;
        assert.equal(a.quota, a.cat === 'tactical' ? kind : null, a.id);
        assert.equal(!!a.mods.laser, a.quota === 'laser' || a.quota === 'combiner', a.id);
        assert.equal(!!a.mods.light, a.quota === 'light' || a.quota === 'combiner', a.id);
        assert.equal(a.mods.spot !== undefined, a.cat === 'tactical', a.id);
        if (a.mods.spot !== undefined) assert.ok(a.mods.spot > 1, `${a.id}: a device on gives the shooter away`);
    }
});

const FACTORS = ['hip', 'precise', 'raise', 'sway', 'bloom', 'kick', 'settle', 'recover', 'spread', 'range', 'reload'] as const;
const FIELDS = new Set<string>([...FACTORS, 'magazine', 'weight', 'noise', 'suppressor', 'grow', 'view', 'braced', 'laser', 'light', 'spot']);
/** The plan's per-attachment guardrails: the lowest factor allowed (40% better at most, handling time 65%, noise 40%). */
const FLOOR: Partial<Record<keyof Factors, number>> = { hip: .6, precise: .6, sway: .6, bloom: .6, kick: .6, settle: .6, spread: .6, raise: .65, reload: .65 };

test('modifiers stay in the schema and inside the per-attachment guardrails; none adds damage or fire rate', () => {
    const inside = (id: string, f: Factors) => {
        for (const [key, value] of Object.entries(f)) {
            assert.ok((FACTORS as readonly string[]).includes(key), `${id}.${key}`);
            assert.ok(Number.isFinite(value) && value > 0 && value <= 1.5, `${id}.${key} = ${value}`);
            assert.ok(value >= (FLOOR[key as keyof Factors] ?? 0), `${id}.${key} = ${value} passes the guardrail`);
        }
        assert.ok((f.recover ?? 1) <= 1.4 && (f.range ?? 1) <= 1.25, id);
    };
    for (const a of parts) {
        const m = a.mods;
        for (const key of Object.keys(m)) assert.ok(FIELDS.has(key), `${a.id}: unknown field ${key}`);
        const { magazine, weight, noise, suppressor, grow, view, braced, laser, light, spot, ...factors } = m;
        inside(a.id, factors);
        // The suppressors, and only they, sound muffled (M2-11); each also cuts the hearing radius.
        assert.equal(suppressor, /消音器/.test(a.name) ? true : undefined, `${a.id}: suppressor`);
        if (suppressor) assert.ok(noise !== undefined && noise < 1, a.id);
        if (braced) { inside(a.id, braced); assert.equal(a.mount, 'bipod', a.id); }
        assert.equal(magazine !== undefined, a.cat === 'mag', a.id);
        if (magazine !== undefined) assert.ok(Number.isInteger(magazine) && magazine > 0, a.id);
        assert.ok(Number.isFinite(weight) && Math.abs(weight) < 1, a.id);
        if (noise !== undefined) assert.ok(noise >= .4 && noise <= 1.5, `${a.id}: noise ${noise}`);
        if (grow) assert.ok(Number.isInteger(grow.w) && Number.isInteger(grow.h) && grow.w >= 0 && grow.h >= 0 && grow.w + grow.h > 0, a.id);
        // Suppressors lengthen the gun a column; the drum and, since #28 M3-12, the long magazines deepen it a row.
        assert.equal(!!grow, /消音器|鼓/.test(a.name) || ['G01', 'G02', 'G04', 'G08'].includes(a.id), `${a.id}: suppressors lengthen, a drum or a long magazine deepens the gun, nothing else`);
        if (grow) assert.deepEqual(grow, /消音器/.test(a.name) ? { w: 1, h: 0 } : { w: 0, h: 1 }, a.id);
        if (view) { assert.equal(a.cat, 'optic'); for (const v of view) assert.ok(v >= 1 && v <= 2, a.id); }
        if (laser) assert.ok(laser.hip >= .6 && laser.hip < 1 && laser.range > 0, a.id);
        if (light) assert.ok(light.radius > 0 && light.arc > 0 && light.arc < Math.PI, a.id);
        if (spot !== undefined) assert.ok(spot <= 1.5, a.id);
    }
});

type Rule = { what: string; on: 'benefit' | 'cost'; words: RegExp; only?: string[]; skip?: string[]; holds: (m: Modifiers) => boolean };
const below = (v: number | undefined) => (v ?? 1) < 1, above = (v: number | undefined) => (v ?? 1) > 1;
/** Keyword readings of the benefit and cost columns. A part whose row uses the words must move that field that way. */
const RULES: Rule[] = [
    { what: 'raises faster', on: 'benefit', words: /快速举枪|举枪快|改善举枪|举枪更快|举枪与移动后恢复更快|较快进入精瞄|快速精瞄|快速操控|轻、快|改善近距操控/, holds: m => below(m.raise) },
    { what: 'raises slower', on: 'cost', words: /举枪稍慢|举枪慢|举枪变慢|举枪略慢|举枪时间增加|举枪和转向恢复慢|举枪较慢|稍慢举枪|操控慢|近距操控最差|近距切换慢|举枪和换弹慢/, holds: m => above(m.raise) },
    { what: 'quieter', on: 'benefit', words: /枪声|声音暴露|枪口暴露|短暂暴露/, holds: m => below(m.noise) },
    { what: 'louder', on: 'cost', words: /枪声|声音暴露/, holds: m => above(m.noise) },
    { what: 'reloads faster', on: 'benefit', words: /换弹更快|快换|换弹快/, holds: m => below(m.reload) },
    { what: 'reloads slower', on: 'cost', words: /换弹变慢|换弹慢|换弹时间增加|补满更慢|补满变慢|装填操控略慢/, holds: m => above(m.reload) },
    { what: 'reaches farther', on: 'benefit', words: /有效距离/, holds: m => above(m.range) },
    { what: 'reaches less', on: 'cost', words: /有效距离/, holds: m => below(m.range) },
    { what: 'tighter pellets', on: 'benefit', words: /弹丸散布|收束双管|更集中/, only: ['枪口', '枪管模块'], holds: m => below(m.spread) },
    { what: 'wider pellets', on: 'cost', words: /集中度下降/, holds: m => above(m.spread) },
    { what: 'lightens the gun', on: 'benefit', words: /减轻|携行/, holds: m => m.weight < 0 },
    { what: 'is light', on: 'benefit', words: /轻便|轻量|低重量|重量低|轻[、，]|轻$/, holds: m => m.weight <= .1 },
    { what: 'is heavy', on: 'cost', words: /增重|较重|更重|重量增加|重量大|重量[和及与]|重量高|略重|少量重量|增加重量|重于|最重|比.+重|^重、/, holds: m => m.weight > 0 },
    { what: 'controls recoil', on: 'benefit', words: /连续|持续|控制|后坐|射击后恢复|点射之间恢复|射击恢复/, skip: ['弹匣和供弹模块'],
        holds: m => below(m.bloom) || below(m.kick) || above(m.recover) || below(m.settle) },
    { what: 'controls less', on: 'cost', words: /持续控制下降/, holds: m => above(m.bloom) || above(m.kick) },
    { what: 'helps only a little', on: 'cost', words: /收益(很|较)?小(?!于)/, holds: m => (m.bloom ?? 1) >= .95 && (m.kick ?? 1) >= .95 && (m.settle ?? 1) >= .95
        && (m.recover ?? 1) <= 1.05 && (m.precise ?? 1) >= .9 && (m.laser?.hip ?? 1) >= .8 },
    { what: 'steadies after moving', on: 'benefit', words: /移动后|移动结束后|转向后/, holds: m => below(m.sway) },
    { what: 'steadies slower after moving', on: 'cost', words: /转向|移动后恢复更慢/, holds: m => above(m.sway) },
    { what: 'aims tighter', on: 'benefit', words: /精瞄|首发|点射较清楚/, holds: m => below(m.precise) || below(m.braced?.precise) },
    { what: 'aims looser', on: 'cost', words: /稳定性下降/, holds: m => above(m.precise) },
    { what: 'tightens hip fire', on: 'benefit', words: /腰射/, holds: m => below(m.hip) || below(m.laser?.hip) },
    { what: 'sees farther', on: 'benefit', words: /观察/, holds: m => Math.max(...m.view ?? [1]) > 1 },
    { what: 'has two sight modes', on: 'benefit', words: /两档/, holds: m => m.view?.length === 2 },
    { what: 'adds no view', on: 'cost', words: /没有额外观察距离/, holds: m => m.view === undefined },
    { what: 'lights things up', on: 'benefit', words: /灯|轮廓提示|近距提示/, only: ['战术设备'], holds: m => !!m.light },
];

test('modifier directions follow each row\'s benefit and cost', () => {
    const matched = new Map<string, Set<string>>();
    for (const doc of DOCS.parts) {
        const a = ATTACHMENTS[doc.id];
        for (const rule of RULES) {
            if (rule.only && !rule.only.includes(doc.heading) || rule.skip?.includes(doc.heading) || !rule.words.test(doc[rule.on])) continue;
            assert.ok(rule.holds(a.mods), `${doc.id} ${doc.name} ${rule.what} (${doc[rule.on]})`);
            matched.set(doc.id, new Set([...matched.get(doc.id) ?? [], rule.what]));
        }
    }
    // Noise, reload, range and pellet spread change only where the row says so.
    const said = (id: string, ...what: string[]) => what.some(w => matched.get(id)?.has(w));
    for (const a of parts) {
        assert.equal(a.mods.noise !== undefined, said(a.id, 'quieter', 'louder'), `${a.id} noise`);
        assert.equal(a.mods.reload !== undefined, said(a.id, 'reloads faster', 'reloads slower'), `${a.id} reload`);
        assert.equal(a.mods.range !== undefined, said(a.id, 'reaches farther', 'reaches less'), `${a.id} range`);
        assert.equal(a.mods.spread !== undefined, said(a.id, 'tighter pellets', 'wider pellets'), `${a.id} spread`);
    }
    // Feed modules: more or fewer rounds than every gun they fit, as their row says.
    for (const doc of DOCS.parts.filter(p => p.heading === '弹匣和供弹模块')) {
        const a = ATTACHMENTS[doc.id], more = /容量提高|增加容量|缓解原厂小容量|持续火力|持续点射/.test(doc.benefit);
        assert.notEqual(more, /容量略减|容量降低|较小容量|减少容量/.test(doc.benefit), doc.id);
        for (const id of a.guns!) assert.ok(more ? a.mods.magazine! > GUNS[id].stats.magazine : a.mods.magazine! < GUNS[id].stats.magazine, `${doc.id} on ${id}`);
    }
});

test('statements that compare rows hold', () => {
    const A = ATTACHMENTS, m = (id: string) => A[id].mods, raise = (id: string) => m(id).raise ?? 1;
    assert.ok(A.O02.weight > A.O01.weight && raise('O02') > raise('O01'), 'O02 is heavier and slower than O01');
    assert.ok(raise('O07') > raise('O06'), 'O07 switches up close slower than O06');
    for (const far of ['O08', 'O09']) assert.ok(Math.max(...m('O06').view!) < Math.max(...m(far).view!), `O06 sees less than ${far}`);
    const optics = parts.filter(a => a.cat === 'optic');
    assert.equal(Math.max(...optics.map(o => o.mods.raise ?? 1)), raise('O09'), 'O09 handles worst up close');
    assert.equal(Math.max(...optics.flatMap(o => o.mods.view ?? [])), Math.max(...m('O09').view!), 'O09 sees farthest');
    assert.ok(A.O10.weight > A.O08.weight && A.O10.buy > A.O08.buy, 'O10 weighs and costs more than the single far scope');
    assert.ok(A.O11.weight > A.O10.weight, 'O11 is heavier still');
    assert.ok(A.H07.weight > A.H06.weight && m('H07').weight > m('H06').weight, 'H07 is heavier than H06');
    assert.ok((m('S01').bloom ?? 1) > (m('S02').bloom ?? 1), 'S01 controls less than S02');
    assert.ok(A.F05.buy > A.F01.buy, 'F05 costs more than F01');
    const grips = ['F01', 'F02', 'F03', 'F04', 'F05', 'F06', 'F07'];
    for (const key of ['bloom', 'kick'] as const) assert.equal(Math.min(...grips.map(id => m(id)[key] ?? 1)), m('F07')[key], `F07 has the most ${key} control`);
    assert.ok(A.T08.weight > A.T04.weight, 'T08 is heavier than T04');
    const devices = parts.filter(a => a.cat === 'tactical');
    assert.equal(Math.max(...devices.map(d => d.weight)), A.T10.weight, 'T10 is the heaviest device');
    assert.equal(Math.min(...devices.filter(d => d.mods.laser).map(d => d.mods.laser!.range)), m('T02').laser!.range, 'T02 has the shortest laser');
    assert.ok(m('T06').light!.radius > m('T05').light!.radius && m('T06').light!.arc < m('T05').light!.arc, 'T06 reaches farther and narrower than T05');
    assert.ok(m('T07').light!.radius < m('T05').light!.radius && m('T07').light!.arc < m('T05').light!.arc, 'T07 is shorter and narrower than T05');
    assert.equal(Math.max(...parts.filter(a => a.cat === 'muzzle').map(a => a.buy)), A.M12.buy, 'M12 is the dearest muzzle part');
    assert.equal(Math.max(...parts.filter(a => a.cat === 'grip').map(a => a.buy)), A.P05.buy, 'P05 is the dearest grip');
    assert.ok(A.H03.buy < A.H04.buy && A.P04.buy < A.P03.buy, 'the wooden AK parts are cheap');
    assert.equal(Math.min(...devices.filter(d => d.quota === 'light').map(d => d.buy)), A.T07.buy, 'T07 is the cheapest light');
    const gain = (a: AttachmentDef) => Math.max(...a.guns!.map(id => a.mods.magazine! - GUNS[id].stats.magazine));
    assert.equal(Math.max(...parts.filter(a => a.cat === 'mag').map(gain)), gain(A.G09), 'G09 adds the most rounds');
    assert.ok(A.G03.mods.magazine! >= .75 * GUNS.mpb5.stats.magazine, 'G03 takes only a few rounds off');
});

test('prices, weights and footprints: parts cost 40 to 1200 and sell for less; the largest legal build fits the 6x5 bag', () => {
    for (const a of parts) {
        assert.ok(a.buy >= 40 && a.buy <= 1200 && a.sell > 0 && a.sell < a.buy, a.id);
        assert.ok(a.weight > 0 && a.weight < 1.5, a.id);
        if (a.mods.weight < 0) assert.ok(['barrel', 'handguard', 'stock', 'grip', 'mag'].includes(a.cat), `${a.id}: only a replacement part can lighten the gun`);
    }
    for (const gun of guns) {
        assert.ok(gun.sell > 0 && gun.sell / gun.buy >= .45 && gun.sell / gun.buy <= .5, gun.id);
        assert.ok(gun.weight > 0 && gun.weight < 6, gun.id);
        const fits = parts.filter(a => a.guns?.includes(gun.id) && a.mods.grow);
        const grow = (cat: string, axis: 'w' | 'h') => Math.max(0, ...fits.filter(a => a.cat === cat).map(a => a.mods.grow![axis]));
        const w = gun.w + grow('muzzle', 'w') + grow('mag', 'w'), h = gun.h + grow('muzzle', 'h') + grow('mag', 'h');
        assert.ok(w <= 6 && h <= 5, `${gun.id} at most ${w}x${h}`);
    }
});

test('factory guns keep the steady set: loose from the hip, accurate only stopped and aimed', () => {
    for (const gun of guns) {
        const h = gun.handling;
        assert.ok(h.hip >= 1 && h.precise <= .5 && h.sway >= 1.2 && h.raise >= .25, gun.id);
        assert.ok(h.bloom > 0 && h.bloom <= h.bloomMax && h.kick > 0 && h.kick <= h.kickMax && h.settle > 0 && h.recover > 0, gun.id);
        assert.equal(h.mode === 'auto', ['smg', 'rifle', 'lmg'].includes(gun.cls) && gun.id !== 'carbine', gun.id);
        const s = gun.stats;
        assert.ok(s.damage > 0 && s.range > 0 && s.cooldown > 0 && s.reload > 0 && s.pellets >= 1 && s.spread > 0 && s.crit >= 0 && s.crit < .2, gun.id);
    }
});
