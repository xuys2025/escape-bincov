/** Controlled save fixtures, real UI input; HTTP is diagnostic, file:// is offline acceptance. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import { placeAt, clickSlot } from './inventory-actions.mjs';
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
  const page = await context.newPage(), errors = []; page.setDefaultTimeout(12000);
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
        app.save.equipment = {weapon:'pistol',ammo:8,ammoRelief:0,relief:false};
        app.save.bag.items=[{uid:'warning-shell',id:'shell',qty:4,x:0,y:0}];
        app.save.safe.items=[{uid:'warning-bandage',id:'bandage',qty:1,x:0,y:0}]; persist();setOverlay('');
      });
      assert.match(await page.locator('#departure-warnings').innerText(),/备用9 毫米弹.*仅在安全箱/);
      assert.equal(await action('deploy').isEnabled(),true);
      const box=await action('deploy').boundingBox(); assert.ok(box.y>=0 && box.y+box.height<=viewport.height);
      await page.screenshot({path:resolve(out,`qol-departure-${label}.png`)});
    });
    await step('loot rotation and quantity previews cancel cleanly; split and partial merge preserve remainders', async () => {
      await page.evaluate(() => {
        const { app, persist } = window.__bincov;
        app.save.equipment = {weapon:'pistol',ammo:8,ammoRelief:0,relief:false};
        app.save.bag.items = [{ uid: 'qol-ammo', id: 'ammo9', qty: 35, x: 0, y: 0 }]; app.save.safe.items = []; persist();
      });
      await page.locator('#seed').fill('42'); await action('deploy').click();
      await page.waitForFunction(() => window.__bincov.app.raid?.player?.active);
      const id = await page.evaluate(() => {
        const a = window.__bincov.app, r = a.raid, c = r.containers[0];
        r.enemies.forEach(e => { e.sprite.setPosition(208,1456); e.home = e.target = {x:208,y:1456}; e.timer = e.cooldown = 9999; e.path = []; });
        c.inventory.items = [{uid:'qol-water',id:'water',qty:2,x:0,y:0},{uid:'qol-incoming',id:'ammo9',qty:12,x:1,y:0}];
        r.player.setPosition(c.x,c.y); r.hp=100; r.bleeding=0; r.checkpoint(); return c.id;
      });
      if (touch) await page.locator(`[data-loot-target="${id}"] button`).tap(); else await page.keyboard.press('e');
      const inventoryState = () => page.evaluate(id => ({bag:window.__bincov.app.loadout.bag, safe:window.__bincov.app.loadout.safe, source:window.__bincov.app.raid.getLootContainer(id).inventory}), id);
      const before = await inventoryState();
      await page.locator('[data-uid="qol-water"]').click(); await action('rotate-item').click();
      assert.deepEqual(await inventoryState(), before); await action('clear-selection').click(); assert.deepEqual(await inventoryState(), before);
      await page.locator('[data-uid="qol-water"]').click(); await page.locator('#split-quantity').fill('1'); await action('split-item').click();
      await action('rotate-preview').click(); await clickSlot(page,'safe',0,0);
      let after = await inventoryState(); assert.equal(after.source.items.find(i=>i.uid==='qol-water').qty,1);
      assert.equal(after.safe.items[0].rotated,true); assert.equal(after.safe.items[0].qty,1); assert.notEqual(after.safe.items[0].uid,'qol-water');
      await placeAt(page,'container','ammo9','bag',0,0); after = await inventoryState();
      assert.equal(after.bag.items.find(i=>i.uid==='qol-ammo').qty,40); assert.equal(after.source.items.find(i=>i.uid==='qol-incoming').qty,7);
      await page.screenshot({path:resolve(out,`qol-inventory-${label}.png`)}); await action('close').click();
    });
    if (!touch) await step('R previews rotation; Escape, outside release, blur and background cancel; hybrid touch placement and normal reload work', async () => {
      await page.keyboard.press('e');
      const snapshot = () => page.evaluate(() => ({bag:window.__bincov.app.loadout.bag, containers:window.__bincov.app.raid.containers.map(c=>c.inventory)}));
      const before = await snapshot();
      async function start() {
        const source = await page.locator('[data-uid="qol-water"]').boundingBox(), grid = await page.locator('[data-grid="bag"]').boundingBox(), cell = grid.width/6;
        await page.mouse.move(source.x+10,source.y+10); await page.mouse.down(); await page.mouse.move(source.x+25,source.y+20,{steps:4});
        await page.mouse.move(grid.x+3.4*cell,grid.y+4.4*cell,{steps:8});
        await page.locator('.drop-preview[data-valid="false"]').waitFor(); await page.keyboard.press('r');
        await page.locator('.drop-preview[data-valid="true"]').waitFor();
        const box = await page.locator('.drop-preview').boundingBox(); assert.ok(Math.abs(box.width/box.height-2)<.05);
      }
      await start(); assert.deepEqual(await snapshot(),before); await page.keyboard.press('Escape'); await page.mouse.up();
      assert.equal(await overlay(),'loot'); assert.deepEqual(await snapshot(),before);
      await start(); await page.mouse.move(-30,-30); await page.mouse.up(); await page.mouse.move(20,20);
      assert.equal(await page.locator('.inventory-drag-ghost').count(),0); assert.deepEqual(await snapshot(),before);
      for (const event of ['blur','visibilitychange']) {
        await start();
        await page.evaluate(event => {
          if (event === 'blur') window.dispatchEvent(new Event('blur'));
          else {
            Object.defineProperty(document,'hidden',{configurable:true,value:true});
            try { document.dispatchEvent(new Event('visibilitychange')); } finally { delete document.hidden; }
          }
        },event);
        await page.mouse.up(); assert.equal(await overlay(),'pause');
        assert.equal(await page.locator('.inventory-drag-ghost').count(),0); assert.deepEqual(await snapshot(),before);
        await page.keyboard.press('Escape'); await page.keyboard.press('e');
      }
      await start(); await page.mouse.up();
      assert.equal((await snapshot()).bag.items.find(i=>i.uid==='qol-water').rotated,true);
      if (hybrid) {
        assert.equal(await page.locator('html').evaluate(el=>el.classList.contains('mobile')),false);
        await page.locator('[data-uid="qol-water"]').tap(); await action('place-item').tap(); await action('rotate-preview').tap();
        const slot=await page.locator('[data-grid="container"]').evaluate(el=>{const r=el.getBoundingClientRect(),c=Number(el.dataset.cell)*r.width/el.offsetWidth;return {x:r.x+c/2,y:r.y+c/2};});
        await page.touchscreen.tap(slot.x,slot.y);
        assert.equal(await page.locator('[data-source="container"][data-uid="qol-water"]').count(),1);
        const afterTouch=await snapshot(); await start(); await page.keyboard.press('Escape'); await page.mouse.up();
        assert.deepEqual(await snapshot(),afterTouch,'Mouse cancellation still works after touch placement');
      }
      await action('close').click();
      await page.evaluate(()=>{const r=window.__bincov.app.raid;r.mag=4;r.syncMagazine();});
      await page.keyboard.press('r'); await page.waitForFunction(()=>window.__bincov.app.raid.reloadLeft>0);
    });
    await step('exit choice shows straight-line bearing; collapsed quests separate stored and carried goods; hit directions expire', async () => {
      assert.equal(await page.locator('#raid-quests').getAttribute('open'),null);
      await action('map').click();
      const exit = await page.evaluate(()=>window.__bincov.app.raid.config.exits[0]);
      await page.locator('#exit-choice').selectOption(exit.name); await action('close').click();
      assert.match(await page.locator('#exit-navigation').innerText(),/直线 [0-9.]+ 格/);
      assert.ok((await page.locator('#exit-navigation').innerText()).includes(exit.name));
      await page.evaluate(()=>{
        const {app}=window.__bincov;
        app.save.stash.items=[{uid:'tracking-stored',id:'scrap',qty:2,x:0,y:0}];
        app.loadout.bag.items.push({uid:'tracking-carried',id:'scrap',qty:1,x:0,y:1});
        app.raid.checkpoint();app.raid.updateHud();
      });
      await page.locator('#raid-quests summary').click();
      assert.equal(await page.locator('#raid-quest-list section').count(),3);
      if (touch) assert.ok(await page.locator('#raid-quests').evaluate(el => { const r=el.getBoundingClientRect(); return [...document.querySelectorAll('#touch-controls button')].every(b=>{const t=b.getBoundingClientRect(); return r.right<=t.left || r.left>=t.right || r.bottom<=t.top || r.top>=t.bottom;}); }), 'Expanded tasks must not cover touch actions');
      if (touch) assert.ok(await page.locator('.radio').evaluate(el => { const r=el.getBoundingClientRect(), n=document.querySelector('.raid-information').getBoundingClientRect(); return r.right<=n.left || r.left>=n.right || r.bottom<=n.top || r.top>=n.bottom; }), 'Radio and navigation must remain readable without overlap');
      assert.match(await page.locator('#raid-quest-list').innerText(),/泵机零件：仓库 2 · 携带 1 \/ 需 3/);
      assert.match(await page.locator('#raid-quests small').innerText(),/携带含带入物资/);
      await page.evaluate(()=>{const r=window.__bincov.app.raid;r.hurt(1,{x:r.player.x+100,y:r.player.y});r.hurt(1,{x:r.player.x,y:r.player.y-100});r.bleeding=0;r.updateHud();});
      assert.equal(await page.locator('#hit-directions i').count(),2);
      await page.screenshot({path:resolve(out,`qol-information-${label}.png`)});
      await page.waitForFunction(()=>document.querySelectorAll('#hit-directions i').length===0);
      const hp=await page.evaluate(()=>{const r=window.__bincov.app.raid;r.bleeding=1;r.pollution=80;return r.hp;});
      await page.waitForFunction(hp=>window.__bincov.app.raid.hp<hp,hp);
      assert.equal(await page.locator('#hit-directions i').count(),0);
    });
  } finally { await context.close(); }
}
try {
  await suite({ width: 1280, height: 720 }); await suite({ width: 1920, height: 1080 });
  await suite({ width: 844, height: 390 }, true); await suite({ width: 667, height: 375 }, true);
  await suite({ width: 740, height: 300 }, true);
} finally { await writeFile(resolve(out, 'qol-report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
