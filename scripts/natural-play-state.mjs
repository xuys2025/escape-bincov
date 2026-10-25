/** Read-only browser callback for natural-play's live report; this never advances or modifies the raid. */
export function readNaturalPlayState() {
  const a = window.__bincov.app, sample = window.__bincovSample, h = sample?.host;
  if (a.state !== 'run' || !h?.lastBatch) return { state: a.state, result: a.save.lastResult, stats: a.save.stats };
  if (typeof sample.driver?.killCount !== 'function') throw Error('Natural play requires a current ?test=1 driver with killCount(); rebuild the selected entry.');
  const b = h.lastBatch, f = b.frame, hud = f.hud, w = b.stamp.world, context = h.services.lootContext();
  const inventory = c => c.id === context?.containerId ? h.services.lootInventory({ runId: w.runId, mapId: w.mapId, kind: 'container', id: c.id }) : null;
  return { state: a.state, hp: hud.hp, bleeding: hud.bleeding, elapsed: b.stamp.simulationTime, high: hud.highTide,
    map: { id: w.mapId, tile: b.map.tile, cells: b.map.cells, doors: b.map.doors, entries: b.map.entries }, doors: f.doors,
    // The host's eventLog holds at most 1000 events and is empty after a view remount; it is not a cumulative counter.
    kills: sample.driver.killCount(),
    mag: hud.weapon.mag, reload: hud.weapon.reloading, cooldown: f.player.state.attackCooldown, x: f.player.x, y: f.player.y,
    exits: b.map.exits.map(e => ({ ...e.at, id: e.id, name: e.name })), loot: f.loot.map(l => ({ x: l.x, y: l.y, id: l.item })),
    overlay: h.panel, saveError: !!document.querySelector('.coast-sample [data-do="retry-save"], .coast-sample [data-do="retry-settlement"]'),
    lootContext: context, bag: a.loadout.bag,
    containers: f.containers.map(c => ({ id: c.id, kind: c.kind, x: c.x, y: c.y, items: c.totalQty, inventory: inventory(c) })),
    enemies: f.actors.filter(e => e.alive).map(e => ({ x: e.x, y: e.y, id: e.kind, tactics: e.tactics })),
    ammo: a.loadout.bag.items.filter(i => i.id === 'ammo9').reduce((sum, i) => sum + i.qty, 0),
    medical: a.loadout.bag.items.filter(i => ['medkit', 'bandage'].includes(i.id)).reduce((sum, i) => sum + i.qty, 0),
    pending: !!a.pendingSettlement };
}
