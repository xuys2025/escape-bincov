/** Controlled save fixtures, real UI input; HTTP is diagnostic, file:// is offline acceptance. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import { resumeStalls } from './stall-resume.mjs';
import { placeAt, clickSlot } from './inventory-actions.mjs';
import { batch, drive, frames, panel, raidReady, waitPanel } from './raid-view.mjs';
const url = new URL(process.env.BINCOV_TEST_URL || pathToFileURL(resolve('dist/index.html')).href);
if (url.protocol !== 'file:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))) throw Error('Only offline or loopback test URLs are supported');
url.searchParams.set('test', '1'); url.searchParams.set('entry', 'tabs');
const out = resolve('test-results'); await mkdir(out, { recursive: true });
const browser = await chromium.launch(browserOptions);
const report = { mode: url.protocol === 'file:' ? 'offline' : 'local HTTP diagnostic', browser: browser.version(), method: 'Real mouse, keyboard and emulated touch input. Blur and background transitions use explicit lifecycle event fixtures; no physical-device certification.', scope: process.argv.includes('--shop-only') ? 'shop' : 'all', results: [] };
async function suite(viewport, touch = false) {
  const label = `${viewport.width}x${viewport.height}${touch ? '-touch' : ''}`;
  const hybrid = !touch && viewport.width === 1280;
  const context = await browser.newContext({ viewport, hasTouch: touch || hybrid, isMobile: touch, offline: url.protocol === 'file:' });
  await resumeStalls(context);
  const page = await context.newPage(), errors = []; page.setDefaultTimeout(30000);
  page.on('pageerror', e => errors.push(e.message));
  await context.route(/^https?:/, route => { if (url.protocol === 'http:' && new URL(route.request().url()).origin === url.origin) return route.continue(); errors.push('External request'); return route.abort(); });
  const action = (name, id) => page.locator(`[data-action="${name}"]${id ? `[data-id="${id}"]` : ''}`);
  const save = () => page.evaluate(() => structuredClone(window.__bincov.app.save));
  const overlay = () => page.evaluate(() => window.__bincov.app.overlay);
  async function step(name, work) {
    const row = { viewport: label, input: hybrid ? 'hybrid mouse and touch' : touch ? 'phone touch' : 'desktop mouse', name, status: 'running' }; report.results.push(row);
    try { await work(); assert.deepEqual(errors, []); row.status = 'passed'; console.log('PASS', label, name); }
    catch (e) { row.status = 'failed'; row.error = e.stack; await page.screenshot({ path: resolve(out, `qol-failed-${label}.png`) }); throw e; }
  }
  try {
    await page.goto(url.href); await action('enter').click();
    await page.evaluate(() => {
      const { app, persist } = window.__bincov;
      app.save.cash = 0; app.save.stash.items = [
        { uid: 'shop-watch', id: 'watch', qty: 1, x: 0, y: 0 },
        { uid: 'shop-scrap', id: 'scrap', qty: 3, x: 1, y: 0 },
      ]; app.save.bag.items = []; app.save.safe.items = []; persist();
    });
    await action('tab', 'arms').click();
    await step('mixed transaction stays provisional, cancels both ways, confirms leaving and uses net cash', async () => {
      const before = await save();
      if (touch) {
        const merchant = page.locator('[data-grid="merchant"]');
        await page.locator('[data-source="merchant"][data-item-id="battery"]').click();
        const scroll = await merchant.evaluate(el => { el.parentElement.scrollTop=70; return el.parentElement.scrollTop; });
        assert.ok(scroll>0,'Short shop catalogue must exercise a real scroll position');
        await action('place-item').click();
        assert.equal(await merchant.evaluate(el=>el.parentElement.scrollTop),scroll,'Placement must keep the catalogue position');
        await action('clear-selection').click();
        assert.equal(await merchant.evaluate(el=>el.parentElement.scrollTop),scroll,'Cancelling must keep the catalogue position');
        assert.deepEqual(await save(),before);
        await merchant.evaluate(el=>{el.parentElement.scrollTop=0;});
      }
      await placeAt(page, 'merchant', 'ammo9', 'buy');
      await placeAt(page, 'stash', 'watch', 'sell');
      assert.deepEqual(await save(), before);
      assert.match(await page.locator('.shop-checkout').innerText(), /可得 ¥ 156/);
      for (const source of ['buy', 'sell']) assert.ok(await page.locator(`[data-source="${source}"]`).first().evaluate(el => { const r=el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)); }), `${source} item center must remain visible and clickable`);
      await page.screenshot({ path: resolve(out, `qol-shop-${label}.png`) });
      if (touch && viewport.height <= 340) {
        await page.locator('[data-source="merchant"][data-item-id="ammo9"]').click(); await action('place-item').click();
        const cancel = await action('clear-selection').boundingBox();
        assert.ok(cancel.y >= 0 && cancel.y + cancel.height <= viewport.height, 'Cancel placement must remain on screen');
        await page.screenshot({ path: resolve(out, `qol-shop-placement-${label}.png`) });
        await action('clear-selection').click(); assert.deepEqual(await save(), before);
      }
      await action('tab', 'med').click(); assert.equal(await overlay(), 'shop-leave');
      await action('close').click(); assert.deepEqual(await save(), before);
      await placeAt(page, 'buy', 'ammo9', 'merchant'); await placeAt(page, 'sell', 'watch', 'stash');
      assert.deepEqual(await save(), before);
      await placeAt(page, 'merchant', 'ammo9', 'buy'); await placeAt(page, 'stash', 'watch', 'sell');
      await action('checkout').click(); const after = await save(); assert.equal(after.cash, 156);
      assert.equal(after.stash.items.find(i => i.id === 'ammo9').qty, 12); assert.ok(!after.stash.items.some(i => i.id === 'watch'));
      assert.equal(await action('checkout').isDisabled(), true);
    });
    await step('quest sale explains final shortage; cancel and save failure preserve the whole transaction', async () => {
      const before = await save(); await placeAt(page, 'stash', 'scrap', 'sell');
      await action('checkout').click(); assert.equal(await overlay(), 'shop-quest');
      assert.match(await page.locator('.modal').innerText(), /需要 泵机零件 3 件.*卖出 3 件.*剩 0 件/s);
      await action('close').click(); assert.deepEqual(await save(), before);
      await page.evaluate(() => { window.__realWrite = Storage.prototype.setItem; Storage.prototype.setItem = function(k,v) { if(k === 'escape-bincov.session.v2') throw new DOMException('quota', 'QuotaExceededError'); return window.__realWrite.call(this,k,v); }; });
      await action('checkout').click(); await action('checkout-confirm').click(); assert.deepEqual(await save(), before);
      await page.evaluate(() => { Storage.prototype.setItem = window.__realWrite; });
      await action('checkout').click(); await action('checkout-confirm').click(); assert.equal((await save()).cash, before.cash + 105);
      await page.reload(); await action('enter').click(); assert.equal((await save()).cash, before.cash + 105);
    });
    if (process.argv.includes('--shop-only')) return;
    await step('departure shows missing matching ammo and safe-only treatment without blocking light deployment', async () => {
      await page.evaluate(() => {
        const {app,persist,setOverlay}=window.__bincov;
        app.save.equipment = {weapon:'pistol',weaponUid:'fixture-pistol',gun:{parts:[],devices:{laser:false,light:false}},ammo:8,ammoRelief:0,relief:false};
        app.save.bag.items=[{uid:'warning-shell',id:'shell',qty:4,x:0,y:0}];
        app.save.safe.items=[{uid:'warning-bandage',id:'bandage',qty:1,x:0,y:0}]; persist();setOverlay('');
      });
      assert.match(await page.locator('#departure-warnings').innerText(),/备用9 毫米弹.*仅在安全箱/);
      assert.equal(await action('deploy').isEnabled(),true);
      const box=await action('deploy').boundingBox(); assert.ok(box.y>=0 && box.y+box.height<=viewport.height);
      await page.screenshot({path:resolve(out,`qol-departure-${label}.png`)});
    });
    // Raid steps run on the 2.5D host: its loot panel, HUD and driver fixtures (?test=1 only).
    const raidPanel = () => panel(page);
    const live = () => page.evaluate(() => {
      const a = window.__bincov.app, raid = window.__bincov.saveSession.captureExpansion().raid;
      return { bag: a.loadout.bag, safe: a.loadout.safe, containers: Object.values(raid.maps).flatMap(m => m.containers.map(c => ({ id: c.id, inventory: c.inventory }))) };
    });
    let crate = '';
    await step('loot rotation and quantity previews cancel cleanly; split and partial merge preserve remainders', async () => {
      await page.evaluate(() => {
        const { app, persist } = window.__bincov;
        app.save.equipment = {weapon:'pistol',weaponUid:'fixture-pistol',gun:{parts:[],devices:{laser:false,light:false}},ammo:8,ammoRelief:0,relief:false};
        app.save.bag.items = [{ uid: 'qol-ammo', id: 'ammo9', qty: 35, x: 0, y: 0 }]; app.save.safe.items = []; persist();
      });
      await page.locator('#seed').fill('42'); await action('deploy').click();
      await raidReady(page);
      // Declared fixture through the session's transaction: an outdoor crate with two waters and twelve rounds, the
      // player beside it at full health, enemies frozen.
      crate = await page.evaluate(() => {
        const { app, saveSession } = window.__bincov, h = window.__bincovSample.host, driver = window.__bincovSample.driver;
        driver.freezeAI(true);
        const box = h.lastBatch.frame.containers.filter(c => c.kind === 'crate' && c.regionId === null).sort((a, b) => Math.hypot(a.x - 640, a.y - 456) - Math.hypot(b.x - 640, b.y - 456))[0];
        if (!box) throw new Error('No outdoor crate for the loot fixture');
        driver.placePlayer({ x: box.x, y: box.y + 12 }, -Math.PI / 2, 'coast');
        const ticket = saveSession.prepareExpansionMutation(draft => {
          const r = draft.expansion.raid, c = r.maps[r.currentMap].containers.find(c => c.id === box.id);
          c.inventory = { w: 6, h: 5, items: [{uid:'qol-water',id:'water',qty:2,x:0,y:0},{uid:'qol-incoming',id:'ammo9',qty:12,x:1,y:0}] };
          Object.assign(draft.expansion.body, { hp: 100, bleeding: false });
        });
        if (!ticket || saveSession.commitExpansionMutation(ticket) !== 'committed') throw new Error(`Loot fixture rejected: ${app.storageError}`);
        return box.id;
      });
      await frames(page, 4);
      assert.equal((await batch(page)).frame.interaction?.ref.id, crate, 'the fixture crate is the interaction target');
      if (touch) await page.locator('.coast-sample [data-act]').tap(); else await page.keyboard.press('e');
      await waitPanel(page, 'loot'); await page.locator('.coast-sample [data-grid="container"]').waitFor();
      const inventoryState = async () => { const s = await live(); return { bag: s.bag, safe: s.safe, source: s.containers.find(c => c.id === crate).inventory }; };
      const before = await inventoryState();
      const water = '.coast-sample [data-uid="qol-water"]', act = name => page.locator(`.coast-sample [data-do="${name}"]`);
      // A rotation preview of a source item changes nothing; cancelling the placement leaves everything in place.
      await page.locator(water).click(); await act('inv-rotate').click();
      assert.deepEqual(await inventoryState(), before); await act('inv-place-cancel').click(); assert.deepEqual(await inventoryState(), before);
      await page.locator(water).click(); await page.locator('.coast-sample [data-split]').fill('1'); await act('inv-split').click();
      await act('inv-place-rotate').click(); await clickSlot(page,'safe',0,0);
      let after = await inventoryState(); assert.equal(after.source.items.find(i=>i.uid==='qol-water').qty,1);
      assert.equal(after.safe.items[0].rotated,true); assert.equal(after.safe.items[0].qty,1); assert.notEqual(after.safe.items[0].uid,'qol-water');
      // Partial merge: the bag's 35 rounds take 5 of the 12 (a stack of 40); 7 stay in the crate.
      await page.locator('.coast-sample [data-source="container"][data-uid="qol-incoming"]').click(); await act('inv-place').click(); await clickSlot(page,'bag',0,0);
      after = await inventoryState();
      assert.equal(after.bag.items.find(i=>i.uid==='qol-ammo').qty,40); assert.equal(after.source.items.find(i=>i.uid==='qol-incoming').qty,7);
      await page.screenshot({path:resolve(out,`qol-inventory-${label}.png`)}); await act('close').click(); await waitPanel(page, null);
    });
    if (!touch) await step('R previews rotation; Escape, outside release, blur and background cancel; hybrid touch placement and normal reload work', async () => {
      const openLoot = async () => { await page.keyboard.press('e'); await waitPanel(page, 'loot'); await page.locator('.coast-sample [data-grid="container"]').waitFor(); };
      await openLoot();
      const snapshot = async () => { const s = await live(); return { bag: s.bag, containers: s.containers.map(c => c.inventory) }; };
      const before = await snapshot();
      async function start() {
        const source = await page.locator('.coast-sample [data-uid="qol-water"]').boundingBox(), grid = await page.locator('.coast-sample [data-grid="bag"]').boundingBox(), cell = grid.width/6;
        await page.mouse.move(source.x+10,source.y+10); await page.mouse.down(); await page.mouse.move(source.x+25,source.y+20,{steps:4});
        await page.mouse.move(grid.x+3.4*cell,grid.y+4.4*cell,{steps:8});
        // R redraws the preview at once, with the pointer still.
        await page.locator('.coast-sample .drop-preview.invalid').waitFor(); await page.keyboard.press('r');
        await page.locator('.coast-sample .drop-preview:not(.invalid)').waitFor();
        const box = await page.locator('.coast-sample .drop-preview').boundingBox(); assert.ok(Math.abs(box.width/box.height-2)<.05);
      }
      await start(); assert.deepEqual(await snapshot(),before); await page.keyboard.press('Escape'); await page.mouse.up();
      assert.equal(await raidPanel(),'loot'); assert.deepEqual(await snapshot(),before);
      await start(); await page.mouse.move(-30,-30); await page.mouse.up(); await page.mouse.move(20,20);
      assert.equal(await page.locator('.cs-ghost').count(),0); assert.deepEqual(await snapshot(),before);
      for (const event of ['blur','visibilitychange']) {
        await start();
        await page.evaluate(event => {
          if (event === 'blur') window.dispatchEvent(new Event('blur'));
          else {
            Object.defineProperty(document,'hidden',{configurable:true,value:true});
            try { document.dispatchEvent(new Event('visibilitychange')); } finally { delete document.hidden; }
          }
        },event);
        await page.mouse.up(); await waitPanel(page, 'pause');
        assert.equal(await page.locator('.cs-ghost').count(),0); assert.deepEqual(await snapshot(),before);
        await page.keyboard.press('Escape'); await waitPanel(page, null); await openLoot();
      }
      await start(); await page.mouse.up(); await frames(page, 2);
      assert.equal((await snapshot()).bag.items.find(i=>i.uid==='qol-water').rotated,true);
      if (hybrid) {
        assert.equal(await page.locator('html').evaluate(el=>el.classList.contains('mobile')),false);
        await page.locator('.coast-sample [data-uid="qol-water"]').tap(); await page.locator('.coast-sample [data-do="inv-place"]').tap(); await page.locator('.coast-sample [data-do="inv-place-rotate"]').tap();
        const slot=await page.locator('.coast-sample [data-grid="container"]').evaluate(el=>{const r=el.getBoundingClientRect(),c=Number(el.dataset.cell)*r.width/el.offsetWidth;return {x:r.x+c/2,y:r.y+c/2};});
        await page.touchscreen.tap(slot.x,slot.y);
        await page.locator('.coast-sample [data-source="container"][data-uid="qol-water"]').waitFor();
        assert.equal(await page.locator('.coast-sample [data-source="container"][data-uid="qol-water"]').count(),1);
        const afterTouch=await snapshot(); await start(); await page.keyboard.press('Escape'); await page.mouse.up();
        assert.deepEqual(await snapshot(),afterTouch,'Mouse cancellation still works after touch placement');
      }
      await page.locator('.coast-sample [data-do="close"]').click(); await waitPanel(page, null);
      await drive(page, 'magazine', 4);
      await page.keyboard.press('r'); await page.waitForFunction(()=>window.__bincovSample.host.lastBatch.frame.hud.weapon.reloading,null,{timeout:15000});
    });
    await step('exit choice shows straight-line bearing; collapsed quests separate stored and carried goods; hit directions expire', async () => {
      assert.equal(await page.locator('.coast-sample [data-quests]').getAttribute('open'),null);
      await page.locator('.coast-sample [data-exit-nav]').click(); await waitPanel(page, 'map');
      const exit = (await batch(page)).map.exits[0];
      await page.locator('.coast-sample [data-panel] [data-exit]').selectOption(exit.name); await page.locator('.coast-sample [data-panel] [data-do="close"]').click(); await waitPanel(page, null);
      await page.waitForFunction(name=>/直线 [0-9.]+ 格/.test(document.querySelector('.coast-sample [data-exit-nav]').textContent)&&document.querySelector('.coast-sample [data-exit-nav]').textContent.includes(name),exit.name,{timeout:15000});
      // Fixture: two pump parts in the stash and one carried (a plain bag edit through the session, as the panel makes it).
      await page.evaluate(()=>{
        const {app,saveSession}=window.__bincov;
        app.save.stash.items=[{uid:'tracking-stored',id:'scrap',qty:2,x:0,y:0}];
        if(saveSession.mutate(()=>{app.loadout.bag.items.push({uid:'tracking-carried',id:'scrap',qty:1,x:0,y:1});})!=='committed')throw new Error('Carried fixture rejected');
      });
      await page.locator('.coast-sample [data-quests] summary').click();
      await page.waitForFunction(()=>/泵机零件：仓库 2 · 携带 1 \/ 需 3/.test(document.querySelector('.coast-sample [data-quest-list]').innerText),null,{timeout:15000});
      assert.equal(await page.locator('.coast-sample [data-quest-list] section').count(),3);
      if (touch) assert.ok(await page.locator('.coast-sample [data-quests]').evaluate(el => { const r=el.getBoundingClientRect(); return [...document.querySelectorAll('.coast-sample .cs-touch button')].every(b=>{const t=b.getBoundingClientRect(); return r.right<=t.left || r.left>=t.right || r.bottom<=t.top || r.top>=t.bottom;}); }), 'Expanded tasks must not cover touch actions');
      if (touch) {
        // A radio line is on screen for the check: the tide warning at 270 s.
        await drive(page, 'clock', 269.9);
        await page.waitForFunction(()=>!document.querySelector('.coast-sample [data-radio]').hidden,null,{timeout:15000});
        assert.ok(await page.locator('.coast-sample [data-radio]').evaluate(el => { const r=el.getBoundingClientRect(), n=document.querySelector('.coast-sample .cs-info').getBoundingClientRect(); return r.width>0 && (r.right<=n.left || r.left>=n.right || r.bottom<=n.top || r.top>=n.bottom); }), 'Radio and navigation must remain readable without overlap');
      }
      assert.match(await page.locator('.coast-sample [data-quest-list]').innerText(),/泵机零件：仓库 2 · 携带 1 \/ 需 3/);
      assert.match(await page.locator('.coast-sample [data-quests] small').innerText(),/携带含带入物资/);
      const p = (await batch(page)).frame.player;
      // Both blows in one task: on a slow runner raid time moves on between page calls, and the first direction could
      // expire before the second lands.
      await page.evaluate(p => { const d = window.__bincovSample.driver; d.hurt(1, { x: p.x + 100, y: p.y }); d.hurt(1, { x: p.x, y: p.y - 100 }); d.vitals({ bleeding: false }); }, p);
      await page.waitForFunction(()=>document.querySelectorAll('.coast-sample [data-hits] i').length===2,null,{timeout:15000});
      await page.screenshot({path:resolve(out,`qol-information-${label}.png`)});
      await page.waitForFunction(()=>document.querySelectorAll('.coast-sample [data-hits] i').length===0,null,{timeout:15000});
      const hp=(await batch(page)).frame.hud.hp;
      await drive(page, 'vitals', { bleeding: true, pollution: 80 });
      await page.waitForFunction(hp=>window.__bincovSample.host.lastBatch.frame.hud.hp<hp,hp,{timeout:15000});
      assert.equal(await page.locator('.coast-sample [data-hits] i').count(),0);
    });
  } finally { await context.close(); }
}
try {
  await suite({ width: 1280, height: 720 }); await suite({ width: 1920, height: 1080 });
  await suite({ width: 844, height: 390 }, true); await suite({ width: 667, height: 375 }, true);
  await suite({ width: 740, height: 300 }, true);
} finally { await writeFile(resolve(out, 'qol-report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
