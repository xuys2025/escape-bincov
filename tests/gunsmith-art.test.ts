/** Gunsmith art (#28 M2-10; ART-SPEC sections 4 and 7): the imported metadata and the layout of Sol's images per configuration. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as D from '../src/domain';
import { ATTACHMENTS, GUNS, isPremium, type GunId } from '../src/gunsmith/catalog';
import { checkInstall, validateBuild } from '../src/gunsmith/compat';
import { buildOf, gunSize, type PartNode } from '../src/gunsmith/instance';
import { GUNSMITH_ART, GUNSMITH_ART_REVISION, GUNSMITH_VIRTUAL } from '../src/art/gunsmith-art-meta';
import { artFrame, gunArtLayout, type ArtCode } from '../src/art/gunsmith-layout';
import { partsOfSignature, partsSignature } from '../src/gunsmith/signature';

const fixture = JSON.parse(readFileSync('tests/fixtures/gunsmith-assemblies.json', 'utf8'));
/** Sol's wave-one records (#28 M3-03, docs/gunsmith/art/m3-w1): 31 configurations of 12 guns, as part trees. */
const wave = JSON.parse(readFileSync('tests/fixtures/gunsmith-assemblies-m3.json', 'utf8'));
/**
 * Sol's wave-two records (#28 M3-07, docs/gunsmith/art/m3-w2): 39 configurations of 14 guns, and the bare side views of
 * the eight new guns and the old three. They follow the receiver's front glove (ART-SPEC 5); the factory Vector's record
 * in `wave` gained that layer when the glove came (d3eb43f).
 */
const waveTwo = JSON.parse(readFileSync('tests/fixtures/gunsmith-assemblies-m3-w2.json', 'utf8'));
/**
 * Sol's redrawn magazines (#28 M3-12, docs/gunsmith/art/m3-w3): 21 configurations, the factory gun and each magazine,
 * I and W. The earlier records stay the truth for everything else: a redrawn magazine keeps its anchor and mounts, so
 * every layer of theirs lies where it did, the tip and width too; only the height may change (matches).
 */
const waveThree = JSON.parse(readFileSync('tests/fixtures/gunsmith-assemblies-m3-w3.json', 'utf8'));
const REDRAWN = new Set<string>(JSON.parse(readFileSync('docs/gunsmith/art/m3-w3/incoming-manifest.json', 'utf8')).assets.map((a: { id: string }) => a.id.replace(/-v\d+$/, '')));
type Layout = NonNullable<ReturnType<typeof gunArtLayout>>;
type Layer = { key: string; label?: string; origin: number[] };
type Assembly = { gun: string; w: number; h: number; tip: unknown; layers: Layer[] };
/**
 * An earlier record's layers since Sol split the SVD's and the Vector's factory magazines off the receiver (#142,
 * docs/gunsmith/art/m4-mags): the magazine is a layer of its own on the receiver's new mag mount, drawn before it. The
 * pixels are the same (Sol's six reassemblies; gunsmith-bench A1 compares the approved previews); every other layer
 * stays where it was.
 */
const SPLIT = new Set(['svdb', 'vb9']);
function split(gun: string, layers: Layer[]): Layer[] {
    const at = layers.findIndex(l => /-receiver-[hiw]$/.test(l.key));
    if (!SPLIT.has(gun) || at < 0) return layers;
    const receiver = layers[at], code = receiver.key.at(-1), mount = GUNSMITH_ART[receiver.key].mounts!.mag!;
    const mag = { key: `gs-${gun}-mag-factory-${code}`, ...receiver.label ? { label: 'mag' } : {}, origin: [receiver.origin[0] + mount[0], receiver.origin[1] + mount[1]] };
    return [...layers.slice(0, at), mag, ...layers.slice(at)];
}
/** `got` is `a`'s picture: each layer at its place, the tip and the size, the height changed only by a redrawn magazine. */
function matches(got: Layout, a: Assembly, name: string, layers = true) {
    if (layers) assert.deepEqual(got.layers.map(l => [l.key, l.label, l.x, l.y]), split(a.gun, a.layers).map(l => [l.key, l.label, ...l.origin]), `${name}: layers`);
    assert.deepEqual(got.tip, a.tip, `${name}: tip`);
    if (a.layers.some(l => REDRAWN.has(l.key))) assert.equal(got.w, a.w, `${name}: width`);
    else assert.deepEqual([got.w, got.h], [a.w, a.h], `${name}: size`);
}
import { CONFIGS, part } from './fixtures/gunsmith-configs';
type Tree = [string, PartNode['slot'], Tree[]?];
const grow = (trees: readonly Tree[]): PartNode[] => trees.map(([id, slot, kids]) => part(id, slot, grow(kids ?? [])));
/** The guns with art: every catalog gun since #28 M3-08 (M2's five, wave one's seven, wave two's eight). */
const ART_GUNS = ['gb17', 'mb4a1', 'carbine', 'pistol', 'shotgun', 'pb226', 'mpb5', 'vb9', 'mb870', 'mb1014', 'akb74', 'akb103', 'augb', 'mb1911', 'umpb45', 'pb90', 'svdb', 'mb14', 'mb700', 'rpkb'] as const;

test('the imported art: 652 images and 5 virtual layers, every key drops its version, the revision is the manifest\'s', () => {
    const manifest = JSON.parse(readFileSync('assets/gunsmith/manifest.json', 'utf8'));
    // M2's 115, less the carbine's two receivers that wave one replaced (v2), plus wave one's 274 (#28 M3-03) and wave
    // two's 249 (M3-07); then sixteen more in M4: six magazine layers and ten magazine icons (#142).
    assert.equal(Object.keys(GUNSMITH_ART).length, 652);
    assert.deepEqual(Object.keys(GUNSMITH_VIRTUAL).sort(), ['gs-carbine-barrel-factory-i', 'gs-carbine-handguard-factory-i', 'gs-carbine-receiver-i', 'gs-pistol-receiver-i', 'gs-shotgun-receiver-i']);
    assert.equal(GUNSMITH_ART_REVISION, manifest.revision);
    assert.deepEqual(Object.keys(GUNSMITH_ART).sort(), manifest.assets.map((a: { id: string }) => a.id.replace(/-v\d+$/, '')).sort());
    // Every part image belongs to an attachment item, every icon to an item.
    for (const [key, art] of Object.entries(GUNSMITH_ART)) {
        if (art.role === 'part') assert.ok(D.isAttachment(art.item!), key);
        if (art.role === 'icon') assert.ok(Object.hasOwn(D.ITEMS, art.item!), key);
    }
});

test('the layout reproduces every approved preview assembly: size, tip, grip, bore, hand and each layer\'s place', () => {
    assert.equal(fixture.assemblies.length, 29);
    for (const a of fixture.assemblies) {
        const parts = CONFIGS[a.gun][a.configuration]();
        assert.ok(validateBuild(buildOf({ id: a.gun as GunId, parts })).ok, `${a.gun} ${a.configuration} is a legal build`);
        const got = gunArtLayout(a.gun, parts, a.code as ArtCode)!, name = `${a.gun} ${a.code} ${a.configuration}`;
        assert.ok(got, name);
        // Wave one cut the carbine's factory barrel out (#28 M3-03), so its layers differ from M2's records; the stack
        // still gives M2's pixels (gunsmith-bench A1 compares them with the approved previews).
        matches(got, a, name, a.gun !== 'carbine');
        if (a.code === 'h') assert.deepEqual([got.grip, got.bore, got.forward, got.hand], [a.grip, a.bore, a.forward, a.hand], `${name}: held geometry`);
    }
});

test('the layout reproduces Sol\'s wave-one assemblies (31 configurations of 12 guns) and wave two\'s (39 of 14), three outputs each', () => {
    assert.equal(wave.assemblies.length, 93);
    assert.equal(waveTwo.assemblies.length, 117);
    for (const [a, records] of [...wave.assemblies.map((a: unknown) => [a, wave]), ...waveTwo.assemblies.map((a: unknown) => [a, waveTwo])]) {
        const parts = grow(records.configurations[a.gun][a.configuration]), name = `${a.gun} ${a.code} ${a.configuration}`;
        assert.ok(validateBuild(buildOf({ id: a.gun as GunId, parts })).ok, `${name} is a legal build`);
        const got = gunArtLayout(a.gun, parts, a.code as ArtCode)!;
        assert.ok(got, name);
        matches(got, a, name);
        if (a.code === 'h') assert.deepEqual([got.grip, got.bore, got.forward, got.hand], [a.grip, a.bore, a.forward, a.hand], `${name}: held geometry`);
    }
    // The bare factory pictures (the ground and the HUD card): the held one without the gloves.
    assert.equal(wave.bareFactories.length, 12);
    assert.equal(waveTwo.bareFactories.length, 11);
    // Wave two drew the old three without hands (#28 M3-07): its records replace wave one's for them.
    for (const a of [...wave.bareFactories.filter((b: { gun: string }) => !waveTwo.bareFactories.some((n: { gun: string }) => n.gun === b.gun)), ...waveTwo.bareFactories]) {
        const got = gunArtLayout(a.gun, [], 'h', false)!;
        assert.deepEqual([got.w, got.h, got.layers.map(l => [l.key, l.x, l.y])], [a.w, a.h, split(a.gun, a.layers).map(l => [l.key, ...l.origin])], a.gun);
    }
});

test('the layout reproduces Sol\'s redrawn magazines (#28 M3-12): 21 configurations, I and W, each within its footprint', () => {
    assert.equal(waveThree.assemblies.length, 42);
    for (const a of waveThree.assemblies) {
        const parts = a.part === 'factory' ? [] : [part(a.part, 'mag')], name = `${a.gun} ${a.code} ${a.part}`;
        assert.ok(validateBuild(buildOf({ id: a.gun as GunId, parts })).ok, `${name} is a legal build`);
        const got = gunArtLayout(a.gun, parts, a.code as ArtCode)!, size = gunSize({ id: a.gun as GunId, parts }), scale = a.code === 'w' ? 2 : 1;
        assert.deepEqual([got.w, got.h, got.tip], [a.w, a.h, a.tip], `${name}: size and tip`);
        assert.deepEqual(got.layers.map(l => [l.key, l.label, l.x, l.y]), split(a.gun, a.layers).map(l => [l.key, l.label, ...l.origin]), `${name}: layers`);
        assert.ok(got.w <= size.w * 36 * scale && got.h <= size.h * 26 * scale, `${name}: ${got.w}x${got.h} within ${size.w}x${size.h} cells`);
    }
});

test('the front glove: on the foregrip, the handguard or the receiver\'s hand (ART-SPEC 5), never on a pistol\'s grip or painted hands', () => {
    const gloves = (gun: string, parts: PartNode[] = []) => gunArtLayout(gun, parts, 'h')!.layers.filter(l => l.label.startsWith('glove')).map(l => l.label);
    // The receiver's hand: the Vector, the AUG and the P90 have no handguard.
    for (const gun of ['vb9', 'augb', 'pb90', 'mb4a1', 'akb74', 'mpb5', 'mb870']) assert.deepEqual(gloves(gun), ['glove-rear', 'glove-front'], gun);
    // A pistol's front hand is its grip; the old guns have their hands painted on.
    for (const gun of ['gb17', 'pb226', 'mb1911']) assert.deepEqual(gloves(gun), ['glove-rear'], gun);
    for (const gun of ['pistol', 'shotgun', 'carbine']) assert.ok(!gloves(gun).includes('glove-front'), gun);
    assert.deepEqual(gloves('augb', [part('F07', 'under')]), ['glove-rear', 'glove-foregrip']);
});

test('the carbine with the P0 muzzle brake keeps the known half pixel between tip and bore (approved, handled at runtime)', () => {
    const custom = gunArtLayout('carbine', CONFIGS.carbine.custom(), 'h')!;
    assert.equal(custom.tip![1] - custom.bore!, .5);
    assert.deepEqual(fixture.assemblies.find((a: { gun: string; code: string; configuration: string }) => a.gun === 'carbine' && a.code === 'h' && a.configuration === 'custom').tipBoreDelta, .5);
});

/**
 * A legal tree with part `id` on `gun`, or null when it can never go on: the part alone, else on (or beside) one other
 * item part that opens its slot or that it needs (F01 on a handguard, O01 on a micro base, M03 on the G17's barrel).
 */
function fitted(gun: GunId, id: string, items: readonly string[]): PartNode[] | null {
    const a = ATTACHMENTS[id], legal = (tree: PartNode[]) => validateBuild(buildOf({ id: gun, parts: tree })).ok;
    if (a.guns && !a.guns.includes(gun)) return null;
    if (legal([part(id, a.mount)])) return [part(id, a.mount)];
    for (const q of items) {
        const b = ATTACHMENTS[q];
        if (q === id || b.guns && !b.guns.includes(gun)) continue;
        const on = [part(q, b.mount, [part(id, a.mount)])], beside = [part(q, b.mount), part(id, a.mount)];
        if (b.provides[a.mount] && legal(on)) return on;
        if (legal(beside)) return beside;
    }
    return null;
}

test('every part that is an item has a mount in all three outputs on each gun with art it fits, within the size limits', () => {
    // A factory magazine (#28 M4-07) is the gun's factory layer, not a part with its own images. 老栓精工's twenty (M4-09)
    // wait for Sol's pictures (docs/gunsmith/art/m4-premium/BRIEF.md; the catalog gate holds that list).
    const parts = Object.keys(D.ITEMS).filter(id => D.isAttachment(id) && Object.hasOwn(ATTACHMENTS, id) && !isPremium(id));
    const checked: string[] = [];
    assert.deepEqual(Object.keys(GUNS).filter(g => artFrame(g, 'h')).sort(), [...ART_GUNS].sort());
    for (const gun of ART_GUNS) {
        for (const id of parts) {
            const a = ATTACHMENTS[id], tree = checkInstall(buildOf({ id: gun, parts: [] }), id).ok ? [part(id, a.mount)] : fitted(gun, id, parts);
            if (!tree) continue;
            checked.push(`${gun}:${id}`);
            for (const code of ['h', 'i', 'w'] as const) {
                const layout = gunArtLayout(gun, tree, code)!;
                const drawn = layout.layers.some(l => l.key.startsWith(`gs-${id.toLowerCase()}-${code}`));
                // Held rear grips are hidden by the glove (M0 review decision 8): the factory grip is drawn instead.
                if (code === 'h' && a.mount === 'grip') assert.ok(!drawn, `${gun} ${id} h`); else assert.ok(drawn, `${gun} ${id} ${code} has a mount`);
                const size = gunSize({ id: gun, parts: tree });
                const limit = code === 'h' ? [48, 16] : code === 'i' ? [size.w * 36, size.h * 26] : [size.w * 72, size.h * 52];
                assert.ok(layout.w <= limit[0] && layout.h <= limit[1], `${gun} ${id} ${code}: ${layout.w}x${layout.h} within ${limit}`);
            }
        }
    }
    // Not vacuous: every sample part is checked on at least one gun.
    assert.deepEqual([...new Set(checked.map(c => c.split(':')[1]))].sort(), [...parts].sort(), `checked ${checked.length}: ${checked.join(' ')}`);
});

test('the side view for the ground and the HUD card: the factory held picture without hands, within the 38 px card', () => {
    for (const gun of ART_GUNS.filter(g => !['pistol', 'shotgun', 'carbine'].includes(g))) {
        const bare = gunArtLayout(gun, [], 'h', false)!, held = gunArtLayout(gun, [], 'h')!;
        assert.ok(!bare.layers.some(l => l.label.startsWith('glove')), gun);
        assert.deepEqual(bare.layers.map(l => l.key), held.layers.filter(l => !l.label.startsWith('glove')).map(l => l.key), gun);
        assert.ok(bare.w <= 38 && bare.h <= 32, `${gun} ${bare.w}x${bare.h}`);
        assert.notEqual(bare.key, held.key);
    }
    // The old guns' held pictures have the hands painted on: their side view is Sol's bare picture on the same canvas
    // (#28 M3-07), and a configured old gun still draws its layers.
    for (const gun of ['pistol', 'shotgun', 'carbine']) {
        const art = GUNSMITH_ART[`gs-${gun}-receiver-h`]!, bare = gunArtLayout(gun, [], 'h', false)!;
        assert.equal(art.wholeCanvasLayer, true, gun);
        assert.deepEqual(bare.layers.map(l => [l.key, l.x, l.y]), [[`gs-${gun}-bare-h`, 0, 0]], gun);
        assert.deepEqual([bare.w, bare.h], [GUNSMITH_ART[`gs-${gun}-bare-h`]!.w, GUNSMITH_ART[`gs-${gun}-bare-h`]!.h], gun);
        assert.ok(bare.w <= 38, gun);
    }
    assert.ok(gunArtLayout('carbine', CONFIGS.carbine.custom(), 'h', false)!.layers.length > 1, 'a configured carbine keeps its layers');
});

test('the cache key: the output, the gun, the parts by place and the art revision, never a uid', () => {
    const a = gunArtLayout('mb4a1', CONFIGS.mb4a1.stable(), 'i')!, b = gunArtLayout('mb4a1', CONFIGS.mb4a1.stable().reverse(), 'i')!;
    assert.equal(a.key, b.key, 'the same parts in another order and under other uids');
    assert.equal(a.key, `gs:i:mb4a1:barrel=B08,handguard/under=F01,handguard=H01,muzzle=M06,rearGrip=P02,stock=S02,top=O08:r${GUNSMITH_ART_REVISION}`);
    assert.equal(gunArtLayout('mb4a1', [], 'h')!.key, `gs:h:mb4a1::r${GUNSMITH_ART_REVISION}`);
    assert.notEqual(gunArtLayout('mb4a1', CONFIGS.mb4a1.light(), 'i')!.key, a.key);
    assert.equal(partsSignature([part('H01', 'handguard', [part('T01', 'side')])]), 'handguard/side1=T01,handguard=H01');
    // The view rebuilds the tree from the signature alone: the same layout as the gun's own parts, no uid needed.
    for (const [gun, configs] of Object.entries(CONFIGS)) for (const make of Object.values(configs)) {
        const parts = make(), back = partsOfSignature(partsSignature(parts))!;
        assert.equal(partsSignature(back), partsSignature(parts));
        for (const code of ['h', 'i', 'w'] as const) assert.deepEqual(gunArtLayout(gun, back, code), gunArtLayout(gun, parts, code), `${gun} ${code}`);
    }
    for (const bad of ['top', '=O03', 'handguard/under=F01', 'nowhere=O03', 'top=O03,top=O08']) assert.equal(partsOfSignature(bad), null, bad);
    // A gun without images keeps its old art (the retired #39 sample id; every catalog gun has art since M3-08); the old pistol and double-barrel have all
    // three outputs since wave one (their inventory pictures cut from the procedural ones).
    for (const code of ['h', 'i', 'w'] as const) assert.equal(gunArtLayout('m4a1', [], code), null, code);
    for (const gun of ['pistol', 'shotgun']) for (const code of ['h', 'i', 'w'] as const) assert.ok(gunArtLayout(gun, [], code), `${gun} ${code}`);
});

test('the workbench frame: every build fits around the same receiver point, so a new part moves nothing else', () => {
    // Wave one's long parts widened the M2 frames: M07 and H02 on the M4A1, B09 and M07 on the carbine (#28 M3); wave
    // two's taller optics and foregrips deepened them.
    // The magazines redrawn at full length (#28 M3-12) deepened them again, below the receiver only.
    assert.deepEqual(artFrame('mb4a1', 'w'), { x: -43, y: -15, w: 216, h: 59 });
    assert.deepEqual(artFrame('gb17', 'w'), { x: 0, y: -9, w: 118, h: 63 });
    assert.deepEqual(artFrame('carbine', 'w'), { x: 0, y: -10, w: 209, h: 54 }, 'an optic on the A07 base sits above the receiver');
    assert.deepEqual(artFrame('akb103', 'w'), { x: -51, y: -19, w: 216, h: 71 });
    // The longest: the RPK with its long handguard and a suppressor; the deepest with its drum.
    assert.deepEqual(artFrame('rpkb', 'w'), { x: -51, y: -19, w: 236, h: 75 });
    assert.equal(artFrame('m4a1', 'w'), null, 'a gun without art has no frame');
    const all = [...Object.entries(CONFIGS).flatMap(([gun, configs]) => Object.entries(configs).map(([name, make]) => [gun, name, make()] as const)),
        ...Object.entries(wave.configurations as Record<string, Record<string, Tree[]>>).flatMap(([gun, configs]) => Object.entries(configs).map(([name, t]) => [gun, name, grow(t)] as const))];
    for (const [gun, name, parts] of all) {
        const f = artFrame(gun, 'w'), l = gunArtLayout(gun, parts, 'w');
        if (!f || !l) continue;
        const r = l.layers.find(x => x.label === 'receiver')!;
        assert.ok(-r.x >= f.x && -r.y >= f.y && l.w - r.x <= f.x + f.w && l.h - r.y <= f.y + f.h, `${gun} ${name} inside the frame`);
    }
});
