import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as D from '../src/domain';
import { ATTACHMENTS, GUNS, type GunId } from '../src/gunsmith/catalog';
import { checkInstall, validateBuild } from '../src/gunsmith/compat';
import { buildOf, gunWeight, type PartNode } from '../src/gunsmith/instance';
import { effectiveStats } from '../src/gunsmith/stats';
import { sourceOf } from '../src/gunsmith/bench';
import { GUNSMITH_ART } from '../src/art/gunsmith-art-meta';
import { artFrame, gunArtLayout } from '../src/art/gunsmith-layout';

// #28 M3-09, the catalog gate (PLAN section 14, M3): all twenty guns and a hundred parts are in the game whole. Each has
// its art, its function and cost, a way to get it and a legal fit; no part is orphaned and nothing is a placeholder; every
// gun can be built two different ways. The detailed rules live in their own tests; this one checks the whole catalog.

const GUN_IDS = Object.keys(GUNS) as GunId[], PART_IDS = Object.keys(ATTACHMENTS);
const OLD = ['pistol', 'shotgun', 'carbine'];
const part = (id: string, kids: PartNode[] = []): PartNode => ({ uid: `gate-${id}`, id, slot: ATTACHMENTS[id].mount, relief: false, children: kids });
const legal = (gun: GunId, parts: PartNode[]) => validateBuild(buildOf({ id: gun, parts })).ok;
/** The part on `gun` alone, or on (or beside) the one item part it needs or that opens its slot; null when it never goes on. */
function fitted(gun: GunId, id: string): PartNode[] | null {
    if (checkInstall(buildOf({ id: gun, parts: [] }), id).ok) return [part(id)];
    for (const q of PART_IDS) {
        if (q === id) continue;
        const on = [part(q, [part(id)])], beside = [part(q), part(id)];
        if (ATTACHMENTS[q].provides[ATTACHMENTS[id].mount] && legal(gun, on)) return on;
        if (legal(gun, beside)) return beside;
    }
    return null;
}

test('twenty guns and a hundred parts, every one an item, nothing else in the catalog', () => {
    assert.equal(GUN_IDS.length, 20); assert.equal(PART_IDS.length, 100);
    for (const id of GUN_IDS) assert.ok(D.isGun(id) && D.ITEMS[id].kind === 'weapon', id);
    for (const id of PART_IDS) assert.ok(D.isAttachment(id) && D.ITEMS[id].kind === 'attachment', id);
    assert.deepEqual(Object.keys(D.ITEMS).filter(id => D.isGun(id)).sort(), [...GUN_IDS].sort());
    assert.deepEqual(Object.keys(D.ITEMS).filter(id => D.isAttachment(id)).sort(), [...PART_IDS].sort());
});

test('art: every gun in the three outputs with its icons and side view, every part in its outputs with its icon; no placeholder', () => {
    for (const gun of GUN_IDS) {
        for (const code of ['h', 'i', 'w'] as const) assert.ok(gunArtLayout(gun, [], code), `${gun} ${code}`);
        assert.ok(artFrame(gun, 'w'), `${gun}: a workbench frame`);
        const side = gunArtLayout(gun, [], 'h', false)!;
        assert.ok(!side.layers.some(l => l.label.startsWith('glove')) && side.w <= 38, `${gun}: a whole side view for the ground and the HUD card`);
        // The old three keep their own painted item icons; every other gun has Sol's.
        if (!OLD.includes(gun)) for (const size of ['q24', 'q32']) assert.ok(GUNSMITH_ART[`gs-${gun}-${size}`], `${gun} ${size}`);
    }
    for (const id of PART_IDS) {
        const key = (code: string) => Object.keys(GUNSMITH_ART).some(k => k.startsWith(`gs-${id.toLowerCase()}-${code}`));
        for (const code of ['i', 'w', 'q24']) assert.ok(key(code), `${id} ${code}`);
        // Held rear grips are hidden by the glove (M0 review decision 8): only they may go without a held image.
        assert.ok(key('h') || ATTACHMENTS[id].mount === 'grip', `${id} h`);
    }
    // Wave two's rounds carry Sol's icons too.
    for (const id of ['ammo45', 'ammoPDW', 'ammoHeavy']) for (const size of ['q24', 'q32']) assert.ok(GUNSMITH_ART[`gs-${id.toLowerCase()}-${size}`], `${id} ${size}`);
});

test('function and cost: every part changes something and says what it gives and what it costs', () => {
    const table = readFileSync('docs/gunsmith/ATTACHMENTS.md', 'utf8');
    for (const id of PART_IDS) {
        const a = ATTACHMENTS[id], row = table.split('\n').find(l => l.startsWith(`| ${id} |`));
        assert.ok(row, `${id}: a row in ATTACHMENTS.md`);
        const cells = row!.split('|').map(c => c.trim()).filter(Boolean);
        assert.ok(cells.at(-2) && cells.at(-1), `${id}: benefit and cost written`);
        // A base does nothing for the shot itself: it opens a slot (or a qualification).
        const opens = Object.keys(a.provides).length > 0 || (a.grants?.length ?? 0) > 0;
        assert.ok(Object.keys(a.mods).some(k => k !== 'weight') || opens, `${id}: changes the gun or opens a slot`);
        // The item says both in its own words: a benefit, then a cost, as sentences.
        assert.ok((D.ITEMS[id].description.match(/。/g) ?? []).length >= 2, `${id}: ${D.ITEMS[id].description}`);
    }
});

test('acquisition: every gun and part is on 老栓\'s shelf or found in a raid, and the workbench says which', () => {
    const shelf = new Set(D.MERCHANTS.arms.stock);
    for (const id of PART_IDS) assert.match(sourceOf(id), shelf.has(id) ? /^修理铺有售/ : /^行动中(的高风险处)?可能找到$/, id);
    // A gun off the shelf is found (D.gunsmithFind's pools: every gun that is an item but those the arms counter stocks).
    const found = new Set<string>(), draw = (values: number[]) => { let i = 0; return () => values[i++]; };
    for (let k = 0; k < 400; k++) for (const rare of [0, 1]) {
        const id = D.gunsmithFind('carbine', draw([0, 0, rare ? 0 : .99, (k + .5) / 400]), { risky: false, gun: true });
        if (id) found.add(id);
    }
    for (const id of GUN_IDS) assert.ok(shelf.has(id) !== found.has(id), `${id}: on the shelf or found, not both`);
    // Every gun's rounds are on the shelf.
    for (const id of GUN_IDS) assert.ok(shelf.has(D.WEAPONS[id].ammo!), `${id}: ${D.WEAPONS[id].ammo} on the shelf`);
});

test('fits: every part goes on a gun a player can own; nothing it needs is missing', () => {
    for (const id of PART_IDS) {
        const facts = D.attachmentFacts(id)!;
        assert.ok(facts.guns.length > 0, `${id} fits no gun`);
        const a = ATTACHMENTS[id];
        for (const gun of a.guns ?? []) assert.ok(D.isGun(gun), `${id}: ${gun} is a gun`);
        // A part it needs first is an item, on guns that are; a qualification it needs comes with some gun or part.
        for (const n of a.needs) { assert.ok(D.isAttachment(n.part), `${id} needs ${n.part}`); for (const g of n.on) assert.ok(D.isGun(g), `${id}: ${g}`); }
        for (const q of a.requires) assert.ok(GUN_IDS.some(g => GUNS[g].quals.includes(q)) || PART_IDS.some(p => ATTACHMENTS[p].grants.includes(q)), `${id} requires ${q}: nothing grants it`);
    }
    // And every gun takes some part: no gun is a dead end on the workbench.
    for (const gun of GUN_IDS) assert.ok(PART_IDS.some(id => fitted(gun, id)), `${gun} takes no part`);
});

test('two directions: every gun can be built lighter or quicker to raise, and steadier, by different parts', () => {
    for (const gun of GUN_IDS) {
        const factory = effectiveStats(buildOf({ id: gun, parts: [] })).handling, weight = GUNS[gun].weight;
        const quick: string[] = [], steady: string[] = [];
        for (const id of PART_IDS) {
            const tree = fitted(gun, id);
            if (!tree) continue;
            const g = { id: gun, parts: tree }, h = effectiveStats(buildOf(g)).handling;
            if (h.raise < factory.raise - 1e-9 || gunWeight(g) < weight - 1e-9) quick.push(id);
            if (h.bloom < factory.bloom - 1e-9 || h.kick < factory.kick - 1e-9 || h.precise < factory.precise - 1e-9) steady.push(id);
        }
        assert.ok(quick.length && steady.length, `${gun}: quick ${quick.join(' ')} | steady ${steady.join(' ')}`);
        assert.ok(quick.some(q => steady.some(s => s !== q)), `${gun}: the two directions take different parts`);
    }
});
