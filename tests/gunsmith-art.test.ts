/** Gunsmith art (#28 M2-10; ART-SPEC sections 4 and 7): the imported metadata and the layout of Sol's images per configuration. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as D from '../src/domain';
import { ATTACHMENTS, GUNS, type GunId } from '../src/gunsmith/catalog';
import { checkInstall, validateBuild } from '../src/gunsmith/compat';
import { buildOf, gunSize, type PartNode } from '../src/gunsmith/instance';
import { GUNSMITH_ART, GUNSMITH_ART_REVISION } from '../src/art/gunsmith-art-meta';
import { artFrame, gunArtLayout, type ArtCode } from '../src/art/gunsmith-layout';
import { partsOfSignature, partsSignature } from '../src/gunsmith/signature';

const fixture = JSON.parse(readFileSync('tests/fixtures/gunsmith-assemblies.json', 'utf8'));
import { CONFIGS, part } from './fixtures/gunsmith-configs';

test('the imported art: 115 images, every key drops its version, the revision is the manifest\'s', () => {
    const manifest = JSON.parse(readFileSync('assets/gunsmith/manifest.json', 'utf8'));
    assert.equal(Object.keys(GUNSMITH_ART).length, 115);
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
        assert.deepEqual([got.w, got.h, got.tip], [a.w, a.h, a.tip], `${name}: size and tip`);
        assert.deepEqual(got.layers.map(l => [l.key, l.label, l.x, l.y]), a.layers.map((l: { key: string; label: string; origin: number[] }) => [l.key, l.label, ...l.origin]), `${name}: layers`);
        if (a.code === 'h') assert.deepEqual([got.grip, got.bore, got.forward, got.hand], [a.grip, a.bore, a.forward, a.hand], `${name}: held geometry`);
    }
});

test('the carbine with the P0 muzzle brake keeps the known half pixel between tip and bore (approved, handled at runtime)', () => {
    const custom = gunArtLayout('carbine', CONFIGS.carbine.custom(), 'h')!;
    assert.equal(custom.tip![1] - custom.bore!, .5);
    assert.deepEqual(fixture.assemblies.find((a: { gun: string; code: string; configuration: string }) => a.gun === 'carbine' && a.code === 'h' && a.configuration === 'custom').tipBoreDelta, .5);
});

test('every sample part that fits a gun with art has a mount in all three outputs, within the size limits', () => {
    const parts = Object.keys(D.ITEMS).filter(D.isAttachment);
    const checked: string[] = [];
    for (const gun of ['mb4a1', 'gb17', 'carbine'] as const) {
        // An opener first when the part needs one (F01 on a handguard, O08 on the carbine's base).
        const openers: Record<string, PartNode[]> = { under: [part(gun === 'carbine' ? 'H05' : 'H01', 'handguard')], side: [part(gun === 'carbine' ? 'H05' : 'H01', 'handguard')], top: gun === 'carbine' ? [part('A07', 'base')] : [] };
        for (const id of parts) {
            const a = ATTACHMENTS[id];
            if (a.guns && !a.guns.includes(gun)) continue;
            let base: PartNode[] = [];
            if (!checkInstall(buildOf({ id: gun, parts: [] }), id).ok) {
                base = structuredClone(openers[a.mount] ?? []);
                if (id === 'M03' && gun === 'gb17') base = [part('B01', 'barrel')];
            }
            const tree = (() => {
                const all = structuredClone(base), opener = all[0];
                const placed = part(id, a.mount);
                if (opener && (a.mount === 'under' || a.mount === 'side' || a.mount === 'top' && gun === 'carbine')) opener.children.push(placed); else all.push(placed);
                return all;
            })();
            if (!validateBuild(buildOf({ id: gun, parts: tree })).ok) continue;
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

test('the side view for the ground and the HUD card: the factory held picture without hands, within the 32 px card', () => {
    for (const gun of ['mb4a1', 'gb17']) {
        const bare = gunArtLayout(gun, [], 'h', false)!, held = gunArtLayout(gun, [], 'h')!;
        assert.ok(!bare.layers.some(l => l.label.startsWith('glove')), gun);
        assert.deepEqual(bare.layers.map(l => l.key), held.layers.filter(l => !l.label.startsWith('glove')).map(l => l.key), gun);
        assert.ok(bare.w <= 32 && bare.h <= 32, `${gun} ${bare.w}x${bare.h}`);
        assert.notEqual(bare.key, held.key);
    }
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
    // Guns without images in an output keep their old art.
    assert.equal(gunArtLayout('pistol', [], 'h'), null);
    assert.equal(gunArtLayout('shotgun', [], 'i'), null);
    assert.ok(GUNS.pistol && gunArtLayout('pistol', [], 'w'));
});

test('the workbench frame: every build fits around the same receiver point, so a new part moves nothing else', () => {
    assert.deepEqual(artFrame('mb4a1', 'w'), { x: -43, y: -15, w: 194, h: 50 });
    assert.deepEqual(artFrame('gb17', 'w'), { x: 0, y: -9, w: 118, h: 51 });
    assert.deepEqual(artFrame('carbine', 'w'), { x: 0, y: -10, w: 171, h: 52 }, 'an optic on the A07 base sits above the receiver');
    assert.equal(artFrame('pistol', 'w')?.w, gunArtLayout('pistol', [], 'w')!.w, 'a gun without parts: its own picture');
    for (const [gun, configs] of Object.entries(CONFIGS)) for (const [name, make] of Object.entries(configs)) {
        const f = artFrame(gun, 'w'), l = gunArtLayout(gun, make(), 'w');
        if (!f || !l) continue;
        const r = l.layers.find(x => x.label === 'receiver')!;
        assert.ok(-r.x >= f.x && -r.y >= f.y && l.w - r.x <= f.x + f.w && l.h - r.y <= f.y + f.h, `${gun} ${name} inside the frame`);
    }
});
