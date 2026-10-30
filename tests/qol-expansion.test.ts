import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../src/domain';
import * as Shop from '../src/shop';
import { createSessionState, SaveSession } from '../src/session';
import { decodeSession, SESSION_KEY } from '../src/recovery-store';
import { advanceLayerShots, settleDepartingShots } from '../src/layer-transition';
import { prototypeRaid, prototypeWorld } from './fixtures/layered';

function sessionFixture() {
    let bytes: string | null = null, fail = false;
    const state = createSessionState();
    const session = new SaveSession(state, () => ({ getItem: key => key === SESSION_KEY ? bytes : null, setItem: (_key, value) => { if (fail) throw Error('quota'); bytes = value; } }));
    assert.ok(session.initialize()); state.state = 'hideout';
    return { state, session, deny(value: boolean) { fail = value; }, get bytes() { return bytes!; } };
}

test('RPG shop keeps cloth and medicines in atomic carts; classic shop cannot buy the extended stock', () => {
    for (const [merchant, id] of [['arms', 'cloth'], ['med', 'analgesic'], ['med', 'focus']] as const) {
        const f = sessionFixture(); assert.ok(f.session.enableRpg()); f.state.save.cash = 10000;
        assert.ok(f.session.persist());
        assert.equal(Shop.createCart(f.state.save, merchant).catalog.items.some(i => i.id === id), false);
        const cart = Shop.createCart(f.state.save, merchant, true), item = cart.catalog.items.find(i => i.id === id)!;
        // The first catalog page (the arms counter's gunsmith goods run onto a second since #28 M3).
        assert.ok(item); assert.equal(cart.catalog.items.length, Shop.catalogPages(Shop.merchantStock(merchant, f.state.save, true))[0].length);
        assert.ok(Shop.moveShopItem(cart, 'merchant', 'buy', item.uid, 0, 0));
        assert.equal(Shop.settleCartResult(structuredClone(f.state.save), cart).ok, false);
        const before = f.bytes, cash = f.state.save.cash, count = D.count(f.state.save.stash, id);
        f.deny(true); assert.equal(f.session.mutate(() => Shop.settleCartResult(f.state.save, cart, true).ok), 'save-failed');
        assert.equal(f.bytes, before); assert.equal(f.state.save.cash, cash); assert.equal(D.count(f.state.save.stash, id), count);
        f.deny(false); assert.equal(f.session.mutate(() => Shop.settleCartResult(f.state.save, cart, true).ok), 'committed');
        assert.equal(f.state.save.cash, cash - D.ITEMS[id].buy); assert.equal(D.count(f.state.save.stash, id), count + 1);
        assert.equal(decodeSession(f.bytes).expansion!.version, 3);
        assert.equal(f.session.mutate(() => Shop.settleCartResult(f.state.save, cart, true).ok), 'rejected');
    }
});

test('layered container split/rotation and partial merging share one durable world/inventory transaction', () => {
    const f = sessionFixture(); assert.ok(f.session.beginRun(42, 'mall')); f.state.state = 'run';
    const setup = f.session.prepareExpansionMutation(d => {
        const raid = d.expansion.raid!, box = raid.maps[raid.currentMap].containers[0];
        box.inventory.items = []; raid.loadout.bag.items = [];
        D.addItem(box.inventory, 'water', 2); D.addItem(box.inventory, 'ammo9', 5);
        D.addItem(raid.loadout.bag, 'ammo9', 39);
    })!;
    assert.equal(f.session.commitExpansionMutation(setup), 'committed');
    const box = () => { const raid = f.state.expansion!.raid!; return raid.maps[raid.currentMap].containers[0]; };
    const water = box().inventory.items.find(i => i.id === 'water')!, before = f.bytes;
    const request = { runId: box().runId, containerId: box().id, from: 'container' as const, to: 'bag' as const, uid: water.uid, x: 1, y: 0, quantity: 1, rotated: true };
    f.deny(true); assert.equal(f.session.transferLoot(box(), request), 'save-failed'); assert.equal(f.bytes, before);
    assert.equal(box().inventory.items.find(i => i.uid === water.uid)!.qty, 2); assert.equal(D.count(f.state.loadout!.bag, 'water'), 0);
    f.deny(false); assert.equal(f.session.transferLoot(box(), request), 'committed');
    const placed = f.state.loadout!.bag.items.find(i => i.id === 'water')!;
    assert.equal(placed.qty, 1); assert.equal(placed.rotated, true); assert.notEqual(placed.uid, water.uid);
    assert.equal(box().inventory.items.find(i => i.uid === water.uid)!.qty, 1);
    const ammo = box().inventory.items.find(i => i.id === 'ammo9')!;
    assert.equal(f.session.transferLoot(box(), { ...request, uid: ammo.uid, x: 0, quantity: 5, rotated: false }), 'committed');
    assert.equal(D.count(f.state.loadout!.bag, 'ammo9'), 40); assert.equal(box().inventory.items.find(i => i.uid === ammo.uid)!.qty, 4);
    const restored = decodeSession(f.bytes).expansion!.raid!;
    assert.deepEqual(restored.loadout, f.state.loadout);
    assert.deepEqual(restored.maps[restored.currentMap].containers[0], box());
});

test('incoming bullet feedback uses actual same-layer hits; blocked and departing bullets do not signal player hits', () => {
    const world = prototypeWorld(), profile = D.newSave(), state = prototypeRaid(profile, world);
    const hits: { x: number; y: number }[] = [];
    state.raid!.maps.downstairs.bullets = [state.raid!.maps.downstairs.bullets[1]];
    const departure = structuredClone(state), blocked = structuredClone(state);
    advanceLayerShots(state, world, 'downstairs', 1, undefined, p => hits.push(p));
    assert.equal(hits.length, 1); assert.deepEqual(hits[0], { x: 48, y: 348 }); assert.equal(state.body.hp, 80);
    settleDepartingShots(departure, world, 'downstairs'); assert.equal(departure.body.hp, 100);
    const opaque = structuredClone(world); opaque.maps.downstairs.cells[2][1] = 'wall';
    advanceLayerShots(blocked, opaque, 'downstairs', 1, undefined, p => hits.push(p));
    assert.equal(hits.length, 1); assert.equal(blocked.body.hp, 100);
});
