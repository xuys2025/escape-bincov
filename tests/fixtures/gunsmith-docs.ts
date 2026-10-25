/**
 * The gunsmith spec as the docs state it (#28 M0-02/03): docs/gunsmith/WEAPONS.md, ATTACHMENTS.md and the ammo table
 * of PLAN.md, parsed here without reading src/gunsmith, so the tests compare the module against an independent
 * reading. Slot ids are the test's own names for the docs' interfaces.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

export type DocSlot = 'micro' | 'top' | 'under' | 'side' | 'pistolSide' | 'bipod';
export interface DocGun {
    id: string; name: string; cls: string; ammo: string; capacity: number; tier: string;
    /** The mod-entry text of WEAPONS.md, and the rails it and the two closing sentences call native. */
    entry: string; native: Set<DocSlot>;
}
export interface DocPart {
    id: string; name: string; brand: string; heading: string; iface: string; benefit: string; cost: string;
    /** A rail part names its interface; any other part lists its guns by short name, resolved to ids. */
    rail: DocSlot | null; guns: string[] | null; longScope: boolean;
    /** Rails a base or handguard opens, read from its benefit text. */
    provides: Partial<Record<DocSlot, number>>;
    grantsLongScope: boolean;
}

const lines = (name: string) => readFileSync(`docs/gunsmith/${name}`, 'utf8').split(/\r?\n/);
const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
const RAILS: Record<string, DocSlot> = {
    '微型瞄具接口': 'micro', '顶部导轨': 'top', '顶部导轨＋远距瞄具资格': 'top', '下导轨': 'under', '侧导轨': 'side',
    '手枪侧挂位': 'pistolSide', '支撑脚架位': 'bipod',
};

function parse() {
    const weapons = lines('WEAPONS.md'), text = weapons.join('\n');
    const guns: DocGun[] = weapons.map(cells).filter(c => c.length === 8 && /^[a-z][a-z0-9]*$/.test(c[0]))
        .map(([id, name, cls, , ammo, capacity, , tier]) => ({ id, name, cls, ammo, capacity: Number(capacity), tier, entry: '', native: new Set<DocSlot>() }));
    /** WEAPONS.md and ATTACHMENTS.md name guns by model ('G17', 'Vector 9mm') or, for the old three, by full name. */
    const byShort = (short: string) => {
        const found = guns.filter(g => g.name === short || g.name.startsWith(`${short} `));
        assert.equal(found.length, 1, `gun name ${short}`);
        return found[0];
    };
    const list = (names: string) => names.split('、').map(s => byShort(s.trim()).id);
    for (const [name, entry] of weapons.map(cells).filter(c => c.length === 2 && guns.some(g => g.name === c[0]))) {
        const gun = byShort(name);
        gun.entry = entry;
        for (const segment of entry.split('；').filter(s => s.startsWith('原生'))) {
            if (segment.includes('微型')) gun.native.add('micro');
            if (segment.includes('顶部')) gun.native.add('top');
            if (segment.includes('下导轨')) gun.native.add('under');
            if (segment.includes('侧导轨')) gun.native.add('side');
            if (segment.includes('手枪侧挂位')) gun.native.add('pistolSide');
            if (segment.includes('支撑脚架')) gun.native.add('bipod');
        }
    }
    const sentence = (pattern: RegExp) => { const m = pattern.exec(text); assert.ok(m, String(pattern)); return list(m[1]); };
    for (const id of sentence(/手枪侧挂位只对\s*(.+?)\s*原生提供/)) guns.find(g => g.id === id)!.native.add('pistolSide');
    for (const id of sentence(/支撑脚架位仅对\s*(.+?)\s*提供/)) guns.find(g => g.id === id)!.native.add('bipod');
    const longScope = new Set(sentence(/远距瞄具资格授予\s*(.+?)；/));
    const classCounts = new Map(weapons.map(cells).filter(c => c.length === 2 && /^\d+$/.test(c[1]) && c[0] !== '合计').map(([cls, n]) => [cls, Number(n)]));

    const attachments = lines('ATTACHMENTS.md'), parts: DocPart[] = [], headings = new Map<string, number>();
    let heading = '';
    for (const line of attachments) {
        const h = /^## (\S+) (\d+) 种$/.exec(line.trim());
        if (h) { heading = h[1]; headings.set(heading, Number(h[2])); continue; }
        const c = cells(line);
        if (c.length !== 6 || !/^[OMBHSPFGTA]\d\d$/.test(c[0])) continue;
        const [id, name, brand, iface, benefit, cost] = c;
        const rail = RAILS[iface] ?? null, provides: Partial<Record<DocSlot, number>> = {};
        if (/开放 micro 接口/.test(benefit)) provides.micro = 1;
        if (/开放 top 接口/.test(benefit)) provides.top = 1;
        const under = /(\d+) 个下导轨/.exec(benefit), side = /(\d+) 个侧位/.exec(benefit);
        if (under) provides.under = Number(under[1]);
        if (side) provides.side = Number(side[1]);
        parts.push({ id, name, brand, heading, iface, benefit, cost, rail, guns: rail ? null : list(iface), longScope: iface.includes('远距瞄具资格'),
            provides, grantsLongScope: /scope 资格/.test(benefit) });
    }
    // Rule 5 of the compatibility section: "M03 on G17/P226 needs B01, M04 on M1911 needs B02".
    const rule = attachments.find(l => l.includes('上需'))!;
    const prereqs = [...rule.matchAll(/([A-Z]\d\d) 在 (\S+?) 上需 ([A-Z]\d\d)/g)].map(m => ({ part: m[1], on: m[2].split('/').map(s => byShort(s).id), needs: m[3] }));
    assert.equal(prereqs.length, 2);

    // PLAN section 4: ammo group names to ids ("保留 ammo9", "新 ammo45").
    const ammo = new Map(readFileSync('docs/gunsmith/PLAN.md', 'utf8').split(/\r?\n/).map(cells)
        .filter(c => c.length === 3 && /^(?:保留|新) \w+$/.test(c[1])).map(([name, id]) => [name, id.split(' ')[1]]));
    return { guns, parts, headings, classCounts, longScope, prereqs, ammo };
}

export const DOCS = parse();

/**
 * What the docs say about one gun and one attachment: `direct` when it goes on the bare gun, `eventual` when it goes
 * on once a base, handguard or prerequisite part is installed first.
 */
export function docExpectation(gunId: string, partId: string): { direct: boolean; eventual: boolean } {
    const gun = DOCS.guns.find(g => g.id === gunId)!, part = DOCS.parts.find(p => p.id === partId)!;
    if (part.guns) {
        const listed = part.guns.includes(gun.id), prereq = DOCS.prereqs.some(r => r.part === part.id && r.on.includes(gun.id));
        return { direct: listed && !prereq, eventual: listed };
    }
    const rail = part.rail!, qualified = !part.longScope || DOCS.longScope.has(gun.id);
    const native = gun.native.has(rail), opened = DOCS.parts.some(o => !!o.guns?.includes(gun.id) && (o.provides[rail] ?? 0) > 0);
    return { direct: native && qualified, eventual: (native || opened) && qualified };
}
