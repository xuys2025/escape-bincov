/** Explicit fixtures accelerate setup; interactions use native keyboard/mouse. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';

const out = resolve('test-results'), SAVE_KEY = 'escape-bincov.session.v2';
const report = { startedAt: new Date().toISOString(), status: 'running', viewports: [], methodology: [
  'Fresh offline file:// contexts at 1280×720 and 1920×1080; browser errors and external requests fail acceptance.',
  'Positions, inventories, enemy readiness and elapsed time are controlled fixtures. E opening, closing, transfers, combat and extraction use real browser keys/mouse.',
  'Real pointer dragTo uses displayed grid geometry. Stale-drag checks close and replace the source while the mouse is held.',
  'Quota injection starts at capture of the trusted pointerup event, so periodic saves remain writable until the transfer. Failed transfers compare inventories and the exact pre-drop session bytes.',
  'The old-client storage-event fixture pauses the first raid scene through the existing opt-in hook, preserving the open loot panel while excluding automatic checkpoints; it resumes after conflict detection.',
  'Repeated refreshes restore matching container, corpse and carried inventories. Three consecutive completed runs verify lifecycle isolation. This is not a natural-play balance test.',
] };
await mkdir(out, { recursive: true });
const browser = await chromium.launch(browserOptions); report.browser = browser.version();
const writeReport = () => writeFile(resolve(out, 'loot-browser-report.json'), JSON.stringify(report, null, 2));
const item = (uid, id, qty = 1, x = 0, y = 0) => ({ uid, id, qty, x, y });

async function suite(viewport) {
  const label = `${viewport.width}x${viewport.height}`;
  const record = { viewport, steps: [], screenshots: [], errors: [], externalRequests: [], runIds: [] }; report.viewports.push(record);
  const context = await browser.newContext({ viewport, offline: true });
  context.on('request', r => { if (/^https?:/i.test(r.url())) record.externalRequests.push(r.url()); });
  await context.route(/^https?:/i, route => route.abort('internetdisconnected'));
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', e => record.errors.push(e.stack || e.message));
  page.on('console', m => { if (m.type() === 'error') record.errors.push(m.text()); });
  const action = name => page.locator(`[data-action="${name}"]`);
  const waitState = state => page.waitForFunction(s => window.__bincov?.app.state === s, state);
  const waitOverlay = value => page.waitForFunction(s => window.__bincov.app.overlay === s, value);
  const snapshot = () => page.evaluate(key => {
    const a = window.__bincov.app, r = a.raid;
    return { state: a.state, overlay: a.overlay, context: a.lootContext, save: a.save, loadout: a.loadout,
      containers: r?.containers.map(c => ({ id: c.id, runId: c.runId, kind: c.kind, inventory: c.inventory })),
      elapsed: r?.elapsed, hp: r?.hp, mag: r?.mag, x: r?.player?.x, y: r?.player?.y, storage: localStorage.getItem(key) };
  }, SAVE_KEY);
  // Automatic checkpoints legitimately update revision/time; compare the inventory
  // content in those commits rather than failing on unrelated frame progress.
  const participants = s => {
    const saved = JSON.parse(s.storage);
    return { loadout: s.loadout, containers: s.containers, save: s.save,
      persisted: { profile: saved.profile, loadout: saved.raid?.loadout, containers: saved.raid?.containers } };
  };
  const screenshot = async name => {
    const path = resolve(out, `loot-${label}-${name}.png`); await page.screenshot({ path }); record.screenshots.push(path);
  };
  async function step(name, work) {
    const result = { name, status: 'running' }, start = performance.now(); record.steps.push(result);
    try {
      const detail = await work(); assert.deepEqual(record.errors, []); assert.deepEqual(record.externalRequests, []);
      result.status = 'passed'; if (detail !== undefined) result.detail = detail; console.log(`PASS ${label} · ${name}`);
    } catch (error) { result.status = 'failed'; result.error = error.stack; throw error; }
    finally { result.durationMs = Math.round(performance.now() - start); await writeReport(); }
  }
  async function quiet() {
    await page.evaluate(() => {
      const r = window.__bincov.app.raid;
      r.enemies.filter(e => e.hp > 0).forEach(e => { e.sprite.setPosition(208, 1456); e.home = { x: 208, y: 1456 }; e.target = { x: 208, y: 1456 }; e.cooldown = 9999; e.timer = 9999; e.alert = 0; e.state = 'patrol'; e.path = []; });
      r.bullets.forEach(b => b.sprite.destroy()); r.bullets = []; r.hp = 100; r.bleeding = 0; r.pollution = 0;
    });
  }
  async function deploy(seed = 42) {
    await page.locator('#seed').fill(String(seed)); await action('deploy').click(); await waitState('run');
    await page.waitForFunction(() => window.__bincov.app.raid?.player?.active && window.__bincov.app.raid.containers.length); await quiet();
    const s = await snapshot(), runId = s.loadout.runId;
    assert.ok(!record.runIds.includes(runId), 'Each new deployment has a distinct run identity'); record.runIds.push(runId);
    assert.equal(s.containers.filter(c => c.kind === 'corpse').length, 0, 'Prior-run corpses never enter a new deployment');
    assert.ok(s.containers.every(c => c.runId === runId), 'All containers belong to the current run');
  }
  async function close() { if ((await snapshot()).overlay) { await page.keyboard.press('Escape'); await waitOverlay(''); } }
  async function fixture({ items = [item('crate-fuse', 'fuse')], bag = [], safe = [], x, y, index = 0 } = {}) {
    await close(); await quiet();
    return page.evaluate(({ items, bag, safe, x, y, index }) => {
      const a = window.__bincov.app, r = a.raid, c = r.containers.filter(c => c.kind === 'crate')[index];
      if (!c) throw new Error('Seed did not generate the fixture crate');
      r.loot.forEach(l => l.sprite.setPosition(208, 1456));
      x ??= c.x; y ??= c.y;
      c.inventory = { w: 6, h: 5, items }; a.loadout.bag.items = bag; a.loadout.safe.items = safe;
      a.save.safe.items = structuredClone(safe);
      r.player.setPosition(x, y); r.highTide = r.config.initialHigh; r.drawFlood(); r.elapsed = 10; r.tideChanged = false; r.warned = false;
      if (!r.checkpoint()) throw new Error('Fixture does not satisfy strict checkpoint validation');
      return { id: c.id, runId: c.runId };
    }, { items, bag, safe, x, y, index });
  }
  async function open(id) {
    await page.keyboard.press('e', { delay: 90 }); await waitOverlay('loot');
    assert.equal((await snapshot()).context.containerId, id); await page.locator('[data-grid="container"]').waitFor();
  }
  async function drag(source, uid, target, x, y) {
    const grid = page.locator(`[data-grid="${target}"]`);
    const g = await grid.evaluate(el => ({ cell: Number(el.dataset.cell), scale: el.getBoundingClientRect().width / el.offsetWidth }));
    await page.locator(`[data-source="${source}"][data-uid="${uid}"]`).dragTo(grid, { targetPosition: { x: (x + .4) * g.cell * g.scale, y: (y + .4) * g.cell * g.scale } });
  }
  async function failStorage(on) {
    await page.evaluate(({ on, key }) => {
      window.__lootRealWrite ??= Storage.prototype.setItem;
      if (window.__lootFaultListener) document.removeEventListener('pointerup', window.__lootFaultListener, true);
      if (!on) { Storage.prototype.setItem = window.__lootRealWrite; return; }
      window.__lootFailedWrites = 0;
      const arm = event => {
        if (!event.isTrusted || !document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-grid]')) return;
        document.removeEventListener('pointerup', arm, true);
        window.__lootStorageAtFault = localStorage.getItem(key);
        Storage.prototype.setItem = function (k, v) {
          if (k === key) { window.__lootFailedWrites++; throw new DOMException('Container quota fixture', 'QuotaExceededError'); }
          return window.__lootRealWrite.call(this, k, v);
        };
      };
      window.__lootFaultListener = arm; document.addEventListener('pointerup', arm, true);
    }, { on, key: SAVE_KEY });
  }
  async function aim(x, y) {
    const p = await page.evaluate(({ x, y }) => {
      const a = window.__bincov.app, c = a.raid.cameras.main, box = a.game.canvas.getBoundingClientRect();
      return { x: box.x + (x - c.scrollX) * box.width / 960, y: box.y + (y - c.scrollY) * box.height / 540 };
    }, { x, y }); await page.mouse.move(p.x, p.y); await page.waitForTimeout(90);
  }
  try {
    await page.goto(pathToFileURL(resolve('dist/index.html')).href + '?test=1'); await action('enter').click(); await deploy();
    await step('25 enemies and original 60 loot entries remain conserved', async () => {
      const c = await page.evaluate(() => {
        const r = window.__bincov.app.raid, total = items => items.reduce((sum, i) => sum + i.qty, 0);
        return { enemies: r.enemies.length, ground: r.loot.length, crates: r.config.containers.length,
          entries: r.config.loot.length + r.config.containers.reduce((sum, c) => sum + c.items.length, 0),
          configuredUnits: total(r.config.loot) + r.config.containers.reduce((sum, c) => sum + total(c.items), 0),
          liveUnits: total(r.loot) + r.containers.reduce((sum, c) => sum + total(c.inventory.items), 0),
          samples: r.loot.filter(i => i.id === 'sample').length, ledgers: r.loot.filter(i => i.id === 'ledger').length };
      });
      assert.equal(c.enemies, 25); assert.equal(c.entries, 60); assert.ok(c.crates > 0 && c.crates <= 10);
      assert.equal(c.liveUnits, c.configuredUnits); assert.ok(c.samples > 0 && c.ledgers > 0); return c;
    });
    await step('pointer crate ↔ bag and crate ↔ safe transfers use exact displayed cells', async () => {
      const c = await fixture({ items: [item('transfer-fuse', 'fuse', 2), item('transfer-pearl', 'pearl', 1, 1)] }); await open(c.id); await screenshot('crate-open');
      await drag('container', 'transfer-fuse', 'bag', 4, 4);
      assert.deepEqual((await snapshot()).loadout.bag.items.find(i => i.uid === 'transfer-fuse'), item('transfer-fuse', 'fuse', 2, 4, 4));
      await drag('bag', 'transfer-fuse', 'container', 3, 2);
      let s = await snapshot(); assert.equal(s.loadout.bag.items.length, 0);
      assert.deepEqual(s.containers.find(x => x.id === c.id).inventory.items.find(i => i.uid === 'transfer-fuse'), item('transfer-fuse', 'fuse', 2, 3, 2));
      await drag('container', 'transfer-pearl', 'safe', 1, 1); s = await snapshot(); assert.equal(s.save.safe.items.find(i => i.uid === 'transfer-pearl').qty, 1);
      await drag('safe', 'transfer-pearl', 'container', 5, 3); assert.equal((await snapshot()).save.safe.items.length, 0);
      await drag('container', 'transfer-fuse', 'container', 0, 3);
      assert.equal((await snapshot()).containers.find(x => x.id === c.id).inventory.items.find(i => i.uid === 'transfer-fuse').y, 3); await screenshot('crate-returned');
    });
    await step('stacks accept partial merges while occupied cells and out-of-bounds shapes preserve items', async () => {
      const c = await fixture({ items: [item('stack-ammo', 'ammo9', 8), item('wide-gun', 'pistol', 1, 1), item('overflow-ammo', 'ammo9', 30, 3)], bag: [item('bag-ammo', 'ammo9', 10)] });
      await open(c.id); await drag('container', 'stack-ammo', 'bag', 0, 0); assert.equal((await snapshot()).loadout.bag.items.find(i => i.uid === 'bag-ammo').qty, 18);
      await drag('container', 'overflow-ammo', 'bag', 0, 0);
      assert.equal((await snapshot()).loadout.bag.items.find(i => i.uid === 'bag-ammo').qty, 40);
      assert.equal((await snapshot()).containers.find(i => i.id === c.id).inventory.items.find(i => i.uid === 'overflow-ammo').qty, 8);
      for (const [uid, x, y] of [['wide-gun', 0, 0], ['wide-gun', 5, 4]]) {
        const before = participants(await snapshot()); await drag('container', uid, 'bag', x, y); assert.deepEqual(participants(await snapshot()), before);
      }
    });
    await step('full inventory rejects transfer atomically', async () => {
      const bag = Array.from({ length: 30 }, (_, i) => item(`full-${i}`, 'fuse', 4, i % 6, Math.floor(i / 6)));
      const c = await fixture({ items: [item('full-incoming', 'sample')], bag }); await open(c.id);
      const before = participants(await snapshot()); await drag('container', 'full-incoming', 'bag', 5, 4); assert.deepEqual(participants(await snapshot()), before); await screenshot('full-bag');
    });
    await step('external selection exposes no direct use or equip; double-click never consumes loot', async () => {
      const c = await fixture({ items: [item('external-medical', 'bandage'), item('external-gun', 'pistol', 1, 1)] }); await open(c.id);
      for (const uid of ['external-medical', 'external-gun']) {
        const before = participants(await snapshot()), el = page.locator(`[data-source="container"][data-uid="${uid}"]`);
        await el.click(); assert.equal(await action('use').count(), 0); assert.equal(await action('equip-run').count(), 0); await el.dblclick(); assert.deepEqual(participants(await snapshot()), before);
      } await screenshot('external-details');
    });
    await step('reopening preserves remaining loot and permits an empty container', async () => {
      const c = await fixture({ items: [item('remaining-a', 'wire'), item('remaining-b', 'fuse', 1, 1)] }); await open(c.id);
      await drag('container', 'remaining-a', 'bag', 0, 0); await close(); await open(c.id); assert.equal(await page.locator('[data-source="container"][data-uid]').count(), 1);
      await drag('container', 'remaining-b', 'bag', 1, 0); await close(); await open(c.id); assert.equal(await page.locator('[data-source="container"][data-uid]').count(), 0);
      assert.equal((await snapshot()).loadout.bag.items.length, 2); await screenshot('empty-crate');
    });
    await step('Escape, Tab, E, close button and map clear loot context', async () => {
      const c = await fixture();
      for (const key of ['Escape', 'Tab', 'e', 'button', 'm']) {
        await open(c.id); if (key === 'button') await action('close').click(); else await page.keyboard.press(key);
        await waitOverlay(key === 'm' ? 'map' : ''); assert.equal((await snapshot()).context, null);
        if (key === 'm') { await page.keyboard.press('m'); await waitOverlay(''); }
      }
    });
    await step('pointer drag previews exact legal and illegal shapes; blur cancels the pending transfer', async () => {
      const c = await fixture({ items: [item('preview-gun', 'pistol')] }); await open(c.id);
      const before = participants(await snapshot());
      const source = await page.locator('[data-uid="preview-gun"]').boundingBox();
      const grid = await page.locator('[data-grid="bag"]').boundingBox();
      const cell = grid.width / 6;
      await page.mouse.move(source.x + 15, source.y + 15); await page.mouse.down();
      await page.mouse.move(source.x + 28, source.y + 25, { steps: 4 });
      await page.mouse.move(grid.x + .4 * cell, grid.y + .4 * cell, { steps: 8 });
      await page.mouse.move(grid.x + .5 * cell, grid.y + .5 * cell);
      await page.locator('[data-grid="bag"] .drop-preview[data-valid="true"]').waitFor();
      await screenshot('drag-valid');
      await page.mouse.move(grid.x + 5.4 * cell, grid.y + 4.4 * cell, { steps: 6 });
      await page.locator('[data-grid="bag"] .drop-preview[data-valid="false"]').waitFor();
      await screenshot('drag-invalid');
      // A lifecycle fixture exercises the same blur handler as switching windows.
      await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await page.mouse.up();
      await waitOverlay('pause'); assert.equal((await snapshot()).context, null);
      assert.deepEqual(participants(await snapshot()), before); await close();
    });
    await step('loot suppresses movement, fire, reload and quick-use while clock and AI continue', async () => {
      const c = await fixture({ bag: [item('input-bandage', 'bandage', 2), item('input-ammo', 'ammo9', 10, 1)] }); await open(c.id);
      await page.evaluate(() => {
        const r = window.__bincov.app.raid, e = r.enemies.find(e => e.hp > 0 && e.id === 'scav');
        e.timer = 5; e.state = 'patrol'; r.hp = 70; r.mag = 3; r.syncMagazine();
      });
      const before = await snapshot(), enemyBefore = await page.evaluate(() => window.__bincov.app.raid.enemies.find(e => e.hp > 0 && e.id === 'scav').timer);
      await page.keyboard.down('d'); await page.keyboard.press('r'); await page.keyboard.press('q'); await page.mouse.down(); await page.waitForTimeout(700);
      const after = await snapshot(); assert.equal(after.x, before.x); assert.equal(after.y, before.y); assert.equal(after.mag, before.mag); assert.equal(after.hp, before.hp);
      assert.equal(after.overlay, 'loot'); assert.deepEqual(after.loadout, before.loadout); assert.ok(after.elapsed > before.elapsed + .3);
      assert.ok(await page.evaluate(() => window.__bincov.app.raid.enemies.find(e => e.hp > 0 && e.id === 'scav').timer) < enemyBefore - .3);
      await page.keyboard.press('Escape'); await page.waitForTimeout(180);
      const held = await snapshot(); assert.equal(held.x, before.x); assert.equal(held.mag, before.mag);
      await page.mouse.up(); await page.keyboard.up('d'); await quiet();
    });
    await step('actual enemy damage keeps loot open', async () => {
      const c = await fixture(); await open(c.id);
      await page.evaluate(() => { const r = window.__bincov.app.raid, e = r.enemies.find(e => e.id === 'scav'); e.sprite.setPosition(r.player.x, r.player.y); e.target = { x: r.player.x, y: r.player.y }; e.state = 'attack'; e.cooldown = 0; });
      await page.waitForFunction(() => window.__bincov.app.raid.hp < 100); assert.equal((await snapshot()).overlay, 'loot'); await screenshot('under-attack'); await close(); await quiet();
    });
    await step('invalid range and rising tide close external inventory', async () => {
      const c = await fixture(); await open(c.id); await page.evaluate(() => { const r = window.__bincov.app.raid; r.player.x += 200; }); await waitOverlay(''); assert.equal((await snapshot()).context, null);
      await close(); await quiet();
      const flooded = await page.evaluate(() => {
        const r = window.__bincov.app.raid, e = r.enemies.find(e => e.hp > 0);
        e.sprite.setPosition(63 * 32 + 16, 10 * 32 + 16); r.damageEnemy(e, 10000);
        const c = r.containers.find(c => c.id === 'corpse-' + e.uid);
        r.player.setPosition(c.x, c.y); r.highTide = false; r.drawFlood();
        return { id: c.id };
      }); await open(flooded.id);
      await page.evaluate(() => { const r = window.__bincov.app.raid; r.elapsed = r.config.tideAt - .01; }); await page.waitForFunction(() => window.__bincov.app.raid.highTide); await waitOverlay(''); assert.equal((await snapshot()).context, null);
    });
    await step('failed writes roll back both directions and safe checkpoints; retry commits once', async () => {
      for (const destination of ['bag', 'safe']) {
        const uid = `failure-${destination}`, c = await fixture({ items: [item(uid, 'pearl')] }); await open(c.id);
        for (const [source, target] of [['container', destination], [destination, 'container']]) {
          const before = participants(await snapshot()); await failStorage(true); await drag(source, uid, target, 0, 0);
          await waitOverlay('checkpoint-error');
          assert.ok(await page.evaluate(() => window.__lootFailedWrites) > 0, 'The trusted pointer release reached the failing session write');
          assert.equal((await snapshot()).storage, await page.evaluate(() => window.__lootStorageAtFault), 'Failed transaction leaves exact session bytes untouched');
          assert.deepEqual(participants(await snapshot()), before); assert.equal((await snapshot()).context, null);
          await failStorage(false); await action('retry-checkpoint').click(); await waitOverlay('pause');
          await close(); await open(c.id); assert.deepEqual(participants(await snapshot()), before, 'Recovery commits the rolled-back inventory, not the rejected transfer');
          await drag(source, uid, target, 0, 0); const after = await snapshot();
          const all = [...after.loadout.bag.items, ...after.loadout.safe.items, ...after.containers.flatMap(c => c.inventory.items)]; assert.equal(all.filter(i => i.uid === uid).length, 1);
          const targetItems = target === 'container' ? after.containers.find(x => x.id === c.id).inventory.items : after.loadout[target].items;
          assert.ok(targetItems.some(i => i.uid === uid)); assert.deepEqual(after.save.safe, after.loadout.safe);
        }
      }
    });
    await step('a held pointer drag cannot mutate a new source after the old context closes', async () => {
      const c = await fixture({ items: [item('stale-drag', 'sample')] }); await open(c.id);
      const source = await page.locator('[data-uid="stale-drag"]').boundingBox();
      await page.mouse.move(source.x+10, source.y+10); await page.mouse.down(); await page.mouse.move(source.x+30,source.y+20,{steps:4});
      await page.keyboard.press('Tab'); await waitOverlay('');
      const other = await fixture({ items: [item('other-container', 'wire')], bag: [item('other-bag-item', 'sample')], index: 1 }); await open(other.id);
      const before = participants(await snapshot()), grid = await page.locator('[data-grid="container"]').boundingBox();
      await page.mouse.move(grid.x+12,grid.y+12); await page.mouse.up(); assert.deepEqual(participants(await snapshot()), before);
    });
    await step('scattered ground loot still uses immediate E pickup', async () => {
      await close(); await quiet();
      const before = await page.evaluate(() => {
        const a = window.__bincov.app, r = a.raid, l = r.loot.find(l => l.id === 'sample');
        r.highTide = false; r.drawFlood(); r.player.setPosition(900, 784); l.sprite.setPosition(900, 784); a.loadout.bag.items = []; return r.loot.length;
      });
      await page.keyboard.press('e', { delay: 90 }); await page.waitForFunction(() => window.__bincov.app.loadout.bag.items.some(i => i.id === 'sample'));
      assert.equal((await snapshot()).overlay, ''); assert.equal((await snapshot()).context, null); assert.equal(await page.evaluate(() => window.__bincov.app.raid.loot.length), before - 1);
    });
    await step('real kill produces one searchable corpse; repeated damage never generates another', async () => {
      await quiet();
      const before = await page.evaluate(() => {
        const r = window.__bincov.app.raid, e = r.enemies.find(e => e.id === 'scav'); r.player.setPosition(700, 784); r.mag = 8; r.syncMagazine(); r.knife = false;
        e.sprite.setPosition(820, 784); e.home = { x: 820, y: 784 }; e.target = { x: 820, y: 784 }; e.hp = 1;
        return { corpses: r.containers.filter(c => c.kind === 'corpse').length, ground: r.loot.length, kills: r.kills, index: r.enemies.indexOf(e) };
      });
      await page.waitForTimeout(550); await aim(820, 784); await page.mouse.down(); await page.waitForTimeout(70); await page.mouse.up();
      await page.waitForFunction(expected => window.__bincov.app.raid.kills === expected, before.kills + 1);
      const corpse = await page.evaluate(index => {
        const r = window.__bincov.app.raid; r.damageEnemy(r.enemies[index], 1000); const c = r.containers.filter(c => c.kind === 'corpse').at(-1); r.player.setPosition(c.x, c.y);
        return { id: c.id, count: r.containers.filter(c => c.kind === 'corpse').length, ground: r.loot.length, kills: r.kills, items: c.inventory.items.length };
      }, before.index);
      assert.equal(corpse.count, before.corpses + 1); assert.equal(corpse.ground, before.ground); assert.equal(corpse.kills, before.kills + 1); assert.ok(corpse.items > 0);
      await open(corpse.id); await screenshot('corpse'); const uid = await page.locator('[data-source="container"][data-uid]').first().getAttribute('data-uid');
      await drag('container', uid, 'bag', 3, 3); assert.ok((await snapshot()).loadout.bag.items.some(i => i.uid === uid)); return corpse;
    });
    await step('three refreshes restore remaining crate/corpse loot and never duplicate taken items', async () => {
      const c = await fixture({ items: [item('reload-bag', 'watch'), item('reload-safe', 'pearl', 1, 1), item('reload-remaining', 'wire', 1, 2)] });
      const corpseId = await page.evaluate(() => {
        const r = window.__bincov.app.raid, corpse = r.containers.find(c => c.kind === 'corpse');
        corpse.x = 900; corpse.y = 784;
        corpse.inventory.items = [{ uid: 'corpse-taken', id: 'fuse', qty: 1, x: 0, y: 0 }, { uid: 'corpse-remaining', id: 'bandage', qty: 1, x: 1, y: 0 }];
        r.player.setPosition(corpse.x, corpse.y);
        if (!r.checkpoint()) throw new Error('Corpse recovery fixture must be a valid checkpoint');
        return corpse.id;
      });
      await open(corpseId); await drag('container', 'corpse-taken', 'bag', 2, 0); await close();
      await page.evaluate(id => { const r = window.__bincov.app.raid, c = r.getLootContainer(id); r.player.setPosition(c.x, c.y); }, c.id); await open(c.id);
      await drag('container', 'reload-bag', 'bag', 0, 0); await drag('container', 'reload-safe', 'safe', 0, 0);
      const expected = await snapshot(), beforeRuns = expected.save.stats.runs;
      for (let i = 0; i < 3; i++) {
        await page.reload(); await action('enter').waitFor();
        assert.equal((await snapshot()).save.stats.runs, beforeRuns, 'Refresh does not redeploy or settle');
        await action('enter').click(); await waitState('run'); await page.waitForFunction(() => window.__bincov.app.raid?.player?.active); await waitOverlay('pause');
        const recovered = await snapshot();
        assert.equal(recovered.context, null); assert.equal(recovered.loadout.runId, expected.loadout.runId);
        assert.deepEqual(recovered.containers, expected.containers); assert.deepEqual(recovered.loadout, expected.loadout);
        assert.deepEqual(recovered.save.stats, expected.save.stats);
        const all = [...recovered.loadout.bag.items, ...recovered.loadout.safe.items, ...recovered.containers.flatMap(c => c.inventory.items)];
        for (const uid of ['reload-bag', 'reload-safe', 'reload-remaining', 'corpse-taken', 'corpse-remaining']) assert.equal(all.filter(i => i.uid === uid).length, 1, `${uid} exists exactly once after refresh ${i + 1}`);
        assert.equal(recovered.containers.filter(c => c.id === corpseId).length, 1);
        await close(); await open(c.id);
        assert.equal(await page.locator('[data-source="container"][data-uid]').count(), 1);
      }
      await screenshot('restored-crate');
    });
    await step('a real second-window storage event closes loot and protects the newer record', async () => {
      // Isolate storage-event handling from the separate old-client/checkpoint race
      // tracked in #24. Keep loot open so the real event must clear its context.
      await page.evaluate(() => window.__bincov.app.raid.scene.pause());
      assert.equal(await page.evaluate(() => window.__bincov.app.raid.scene.isPaused()), true);
      const before = await snapshot();
      assert.equal(before.overlay, 'loot');
      assert.ok(before.context);
      const other = await context.newPage();
      try {
        await other.goto(pathToFileURL(resolve('dist/index.html')).href + '?test=1');
        await other.waitForFunction(() => window.__bincov);
        assert.equal(await other.evaluate(() => window.__bincov.app.storageOK), false, 'The second game page cannot take ownership');
        assert.deepEqual((await snapshot()).context, before.context, 'Loot stays open until the real storage event');
        const winner = await other.evaluate(key => {
          // Simulate an older client that does not obey the current page lock.
          const value = JSON.parse(localStorage.getItem(key)); value.revision++;
          const bytes = JSON.stringify(value); localStorage.setItem(key, bytes); return bytes;
        }, SAVE_KEY);
        await page.waitForFunction(() => window.__bincov.app.conflict);
        assert.equal((await snapshot()).elapsed, before.elapsed, 'No periodic checkpoint can race the old-client write');
        await page.evaluate(() => window.__bincov.app.raid.scene.resume());
        const after = await snapshot(); assert.equal(after.context, null);
        assert.deepEqual(after.loadout, before.loadout); assert.equal(after.storage, winner);
      } finally { await other.close(); }
      await page.reload(); await action('enter').click();
      await page.waitForFunction(() => window.__bincov.app.raid?.player?.active); await waitOverlay('pause');
      assert.deepEqual((await snapshot()).loadout, before.loadout);
    });
    await step('death while looting closes context, loses bag loot and retains safe loot', async () => {
      const c = await fixture({ items: [item('death-bag', 'wire'), item('death-safe', 'sample', 1, 1)] }); await open(c.id);
      await drag('container', 'death-bag', 'bag', 0, 0); await drag('container', 'death-safe', 'safe', 0, 0);
      await page.evaluate(() => { const r = window.__bincov.app.raid, e = r.enemies.find(e => e.hp > 0 && e.id === 'scav'); r.hp = 1; e.sprite.setPosition(r.player.x, r.player.y); e.target = { x: r.player.x, y: r.player.y }; e.state = 'attack'; e.cooldown = 0; });
      await waitState('result'); const s = await snapshot(); assert.equal(s.context, null); assert.equal(s.save.lastResult.outcome, 'death'); assert.equal(s.save.bag.items.length, 0);
      assert.ok(s.save.safe.items.some(i => i.uid === 'death-safe')); await screenshot('death-result');
    });
    await step('real three-second extraction keeps dragged container loot', async () => {
      await action('return').click(); await deploy(44); const c = await fixture({ items: [item('extract-loot', 'ledger')] }); await open(c.id); await drag('container', 'extract-loot', 'bag', 0, 0); await close();
      await page.evaluate(() => { const r = window.__bincov.app.raid; r.player.setPosition(r.config.exits[0].x, r.config.exits[0].y); });
      const started = performance.now(); await page.keyboard.down('e'); try { await waitState('result'); } finally { await page.keyboard.up('e'); }
      assert.ok(performance.now() - started >= 2500); const s = await snapshot(); assert.equal(s.context, null); assert.equal(s.save.lastResult.outcome, 'extract'); assert.ok(s.save.bag.items.some(i => i.uid === 'extract-loot'));
    });
    await step('timeout while looting closes context and resolves as failure', async () => {
      await action('return').click(); await deploy(45); const c = await fixture(); await open(c.id);
      await page.evaluate(() => { const r = window.__bincov.app.raid; r.elapsed = r.config.duration - .01; }); await waitState('result'); const s = await snapshot(); assert.equal(s.context, null); assert.equal(s.save.lastResult.outcome, 'timeout');
      assert.equal(s.save.stats.runs, 3); assert.equal(s.save.stats.extracts, 1); assert.equal(new Set(record.runIds).size, 3);
      await page.reload(); await action('enter').waitFor(); assert.deepEqual((await snapshot()).save, s.save, 'The three terminal results survive reload without an extra award');
    });
  } finally {
    if (record.steps.some(s => s.status === 'failed')) await screenshot('failure').catch(() => {});
    await failStorage(false).catch(() => {}); await context.close();
  }
}
async function mobileSuite() {
  const viewport = { width: 844, height: 390 }, record = { viewport, mode: 'touch', steps: [], screenshots: [], errors: [], externalRequests: [] };
  report.viewports.push(record);
  const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 1, offline: true });
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', error => record.errors.push(error.message));
  context.on('request', request => { if (/^https?:/.test(request.url())) record.externalRequests.push(request.url()); });
  const action = name => page.locator(`[data-action="${name}"]`);
  const state = () => page.evaluate(() => {
    const a = window.__bincov.app, r = a.raid;
    return { overlay: a.overlay, lootContext: a.lootContext, loadout: a.loadout, containers: r?.containers };
  });
  const check = async (name, work) => {
    const step = { name, status: 'running' }; record.steps.push(step);
    try { await work(); assert.deepEqual(record.errors, []); assert.deepEqual(record.externalRequests, []); step.status = 'passed'; console.log('PASS touch · ' + name); }
    catch (error) { step.status = 'failed'; step.error = error.stack; throw error; }
    finally { await writeReport(); }
  };
  const shot = async name => { const path = resolve(out, `loot-844x390-${name}.png`); await page.screenshot({ path }); record.screenshots.push(path); };
  const move = async (source, uid, target, x, y) => {
    await page.locator(`[data-source="${source}"][data-uid="${uid}"]`).tap();
    await action('place-item').tap();
    const grid = page.locator(`[data-grid="${target}"]`), cell = await grid.getAttribute('data-cell');
    await grid.tap({ position: { x: (x + .4) * Number(cell), y: (y + .4) * Number(cell) } });
  };
  try {
    await page.goto(pathToFileURL(resolve('dist/index.html')).href + '?test=1');
    await action('enter').tap(); await page.locator('#seed').fill('42'); await action('deploy').tap();
    await page.waitForFunction(() => window.__bincov?.app.raid?.containers.length);
    const id = await page.evaluate(() => {
      const a = window.__bincov.app, r = a.raid, c = r.containers[0];
      r.enemies.forEach(e => { e.sprite.setPosition(208, 1456); e.home = { x: 208, y: 1456 }; e.target = { x: 208, y: 1456 }; e.timer = e.cooldown = 9999; });
      r.player.setPosition(c.x, c.y); a.loadout.bag.items = []; a.loadout.safe.items = []; a.save.safe.items = [];
      c.inventory.items = [{ uid: 'touch-fuse', id: 'fuse', qty: 2, x: 0, y: 0 }];
      if (!r.checkpoint()) throw new Error(a.storageError);
      return c.id;
    });
    await check('trusted touch interaction opens the same live source and character grids', async () => {
      await page.locator('#touch-interact').tap(); await page.locator('.loot-modal').waitFor();
      assert.equal((await state()).lootContext.containerId, id);
      const b = await page.locator('.loot-header [data-action="close"]').boundingBox();
      assert.ok(b && b.x >= 0 && b.x + b.width <= viewport.width && b.y >= 0 && b.y + b.height <= viewport.height);
      await shot('open');
    });
    await check('select and tap transfers only to the chosen backpack cell', async () => {
      await move('container', 'touch-fuse', 'bag', 1, 1);
      assert.deepEqual((await state()).loadout.bag.items, [item('touch-fuse', 'fuse', 2, 1, 1)]);
    });
    await check('touch safe and return operations preserve the whole stack', async () => {
      await move('bag', 'touch-fuse', 'safe', 1, 1);
      assert.deepEqual((await state()).loadout.safe.items, [item('touch-fuse', 'fuse', 2, 1, 1)]);
      await move('safe', 'touch-fuse', 'container', 2, 1);
      const s = await state(); assert.equal(s.loadout.safe.items.length, 0);
      assert.deepEqual(s.containers.find(c => c.id === id).inventory.items, [item('touch-fuse', 'fuse', 2, 2, 1)]);
      await shot('returned');
    });
    await check('touch close and reload retain container contents and clear selection', async () => {
      const before = await state(); await action('close').tap();
      assert.equal((await state()).lootContext, null);
      await page.reload(); await action('enter').tap();
      await page.waitForFunction(() => window.__bincov.app.overlay === 'pause');
      assert.deepEqual((await state()).containers, before.containers);
    });
  } finally {
    if (record.steps.some(s => s.status === 'failed')) await shot('failure').catch(() => {});
    await context.close();
  }
}
async function legacySuite(file) {
  const record = { mode: 'actual-old-main', steps: [], errors: [] }; report.viewports.push(record);
  let context, page;
  const open = async (path, bytes) => {
    context = await browser.newContext({ viewport: { width: 1280, height: 720 }, offline: true });
    if (bytes) await context.addInitScript(({ key, bytes }) => { localStorage.setItem(key, bytes); }, { key: SAVE_KEY, bytes });
    page = await context.newPage(); page.on('pageerror', error => record.errors.push(error.message));
    await page.goto(pathToFileURL(resolve(path)).href + '?test=1');
  };
  const action = name => page.locator('[data-action="' + name + '"]');
  const step = { name: 'actual old main restores loose loot once; old HTML refuses the container world without overwrite', status: 'running' }; record.steps.push(step);
  try {
    await open(file);
    await action('enter').click(); await page.locator('#seed').fill('42'); await action('deploy').click();
    await page.waitForFunction(() => window.__bincov.app.raid?.player?.active); await page.keyboard.press('Escape');
    const oldBytes = await page.evaluate(key => localStorage.getItem(key), SAVE_KEY), old = JSON.parse(oldBytes);
    assert.equal(old.raid.worldVersion, 'coast-v1'); assert.equal(old.raid.loot.length, 60); await context.close();
    await open('dist/index.html', oldBytes);
    await action('enter').click(); await page.waitForFunction(() => window.__bincov.app.raid?.player?.active);
    const nextBytes = await page.evaluate(key => localStorage.getItem(key), SAVE_KEY), migrated = JSON.parse(nextBytes);
    assert.equal(migrated.raid.worldVersion, 'coast-v2'); assert.deepEqual(migrated.raid.containers, []);
    assert.deepEqual(migrated.raid.loot, old.raid.loot); assert.deepEqual(migrated.raid.loadout, old.raid.loadout); await context.close();
    await open(file, nextBytes); await page.getByRole('heading', { name: '暂时无法打开存档' }).waitFor();
    const rejected = await page.evaluate(key => ({ ok: window.__bincov.app.storageOK, bytes: localStorage.getItem(key) }), SAVE_KEY);
    assert.equal(rejected.ok, false); assert.equal(rejected.bytes, nextBytes);
    assert.deepEqual(record.errors, []); step.status = 'passed'; console.log('PASS ' + step.name);
  } catch (error) { step.status = 'failed'; step.error = error.stack; throw error; }
  finally { await context?.close(); await writeReport(); }
}
try {
  await suite({ width: 1280, height: 720 }); await suite({ width: 1920, height: 1080 }); await mobileSuite();
  if (process.env.BINCOV_LOOT_LEGACY_HTML) await legacySuite(process.env.BINCOV_LOOT_LEGACY_HTML);
  report.status = 'passed';
}
catch (error) { report.status = 'failed'; report.failure = error.stack; console.error(error); process.exitCode = 1; }
finally { report.finishedAt = new Date().toISOString(); await writeReport(); await browser.close(); }
