/** Approved tactical layout: real offline UI input, with explicitly labelled inventory fixtures. */
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import { placeAt } from './inventory-actions.mjs';
import * as D from '../src/domain.ts';
const out = resolve('test-results/tactical');
await mkdir(out, {recursive:true});
const report = {htmlSha256:createHash('sha256').update(await readFile('dist/index.html')).digest('hex'),checks:[], errors:[], externalRequests:[], method:'Unmodified offline game captures. The all-item and rotated inventories are declared fixtures; buying, selling, selection, and drag/drop use real browser input.'};
const browser = await chromium.launch(browserOptions);
report.browser = browser.version();
try {
  for (const [width,height] of [[1280,720],[1920,1080]]) {
    const context = await browser.newContext({viewport:{width,height},offline:true});
    context.on('request',r=>{if(/^https?:/.test(r.url()))report.externalRequests.push(r.url());});
    const page = await context.newPage();
    page.on('pageerror',e=>report.errors.push(e.message));
    const action=(name,id)=>page.locator(`[data-action="${name}"]${id?`[data-id="${id}"]`:''}`);
    const shot=async name=>{await page.evaluate(()=>document.fonts.ready);await page.waitForFunction(()=>getComputedStyle(document.getElementById('toast')).opacity==='0');await page.screenshot({path:resolve(out,`${width}x${height}-${name}.png`)});};
    const check=name=>{report.checks.push(`${width}x${height}: ${name}`);console.log(`PASS ${width}x${height}: ${name}`);};
    await page.goto(pathToFileURL(resolve('dist/index.html')).href+'?test=1&entry=tabs');
    await action('enter').click();
    const box=selector=>page.locator(selector).boundingBox();
    const equipment=await box('.equipment-section'),bag=await box('[data-grid="bag"]'),stash=await box('[data-grid="stash"]'),safe=await box('[data-grid="safe"]'),details=await box('.details');
    assert.ok(equipment.x+equipment.width<bag.x && bag.x+bag.width<stash.x);
    assert.ok(safe.y+safe.height<=details.y && stash.y+stash.height<=details.y,`All default inventory rows remain visible: ${JSON.stringify({safe,stash,details})}`);
    const cell=width===1920?80:54;
    assert.equal(await page.locator('[data-grid="bag"]').getAttribute('data-cell'),String(cell));
    await page.locator('[data-source="bag"][aria-label^="密封绷带"]').click();
    assert.equal((await box('.details')).y,details.y,'Selecting an item must not move the inspector');
    assert.deepEqual(await page.locator('.item-label').evaluateAll(labels=>[...new Set(labels.map(e=>getComputedStyle(e).fontSize))]),['16px']);
    const cdp=await context.newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');
    const doc=await cdp.send('DOM.getDocument');const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'.item-description'});
    const {fonts}=await cdp.send('CSS.getPlatformFontsForNode',{nodeId});
    assert.ok(fonts.some(f=>f.familyName==='Bincov Text'&&f.isCustomFont&&f.glyphCount>0));await cdp.detach();
    check('equipment / bag / stash order, visible safe, fixed details, actual font B at 16px');
    const fixture={w:10,h:6,items:[]};
    for(const id of Object.keys(D.ITEMS))assert.equal(D.addItem(fixture,id,1),0);
    await page.evaluate(stash=>{window.__bincov.app.save.stash=stash;},fixture);
    await action('tab','gear').click();
    assert.equal(await page.locator('[data-source="stash"] .inventory-art-image').count(),Object.keys(D.ITEMS).length);
    await shot('all-items');
    async function noClipping() {
      const bad=await page.locator('.item .inventory-art-image').evaluateAll(images=>images.filter(img=>{
        const r=img.getBoundingClientRect(),p=img.parentElement.getBoundingClientRect();
        return r.left<p.left-.1||r.right>p.right+.1||r.top<p.top-.1||r.bottom>p.bottom+.1;
      }).map(img=>img.dataset.art));
      assert.deepEqual(bad,[],'Proportioned and rotated art must stay inside its reserved area');
    }
    await noClipping();
    const rotated={w:10,h:6,items:[]};
    for(const id of ['pistol','shotgun','carbine','medkit','ledger','water','battery','knife']) {
      assert.equal(D.addItem(rotated,id,1,false,true,false),0);
    }
    await page.evaluate(stash=>{window.__bincov.app.save.stash=stash;},rotated);await action('tab','gear').click();
    await noClipping();await shot('rotated-items');check(`${Object.keys(D.ITEMS).length} inventory objects, eight rotated shapes, no clipped artwork`);
    // Keep the accepted art and inspection while buying/selling through the QOL cart.
    await page.evaluate(()=>{const s=window.__bincov.app.save;s.stash.items=[];s.cash=5000;});
    await action('tab','arms').click();
    const merchant = await box('[data-grid="merchant"]'), buy = await box('[data-grid="buy"]'), sell = await box('[data-grid="sell"]'), warehouse = await box('[data-grid="stash"]');
    assert.ok(merchant.x + merchant.width < buy.x && buy.x + buy.width < warehouse.x && buy.y + buy.height < sell.y);
    await noClipping();
    await page.locator('[data-source="merchant"][data-item-id="carbine"]').click();
    assert.match(await page.locator('.shop-details').textContent(),/适合远距离点射/);
    await placeAt(page,'merchant','carbine','buy');
    assert.equal(await page.evaluate(()=>window.__bincov.app.save.cash),5000,'Staging merchandise must not spend cash');
    await action('checkout').click();
    assert.equal(await page.evaluate(()=>window.__bincov.app.save.cash),3800);
    await page.locator('[data-source="stash"][aria-label^="半自动卡宾枪"]').click();
    await shot('trader');await placeAt(page,'stash','carbine','sell');await action('checkout').click();
    assert.equal(await page.evaluate(()=>window.__bincov.app.save.cash),4380);
    assert.equal(await page.locator('[data-source="stash"][aria-label^="半自动卡宾枪"]').count(),0);
    check('merchant / buy-sell buffer / warehouse order, artwork, inspection and atomic checkout');
    await action('tab','gear').click();await page.locator('#seed').fill('42');await action('deploy').click();
    await page.waitForFunction(()=>window.__bincov.app.raid?.player?.active);
    const source={w:6,h:5,items:[]};for(const id of ['carbine','medkit','water','wire','sample'])D.addItem(source,id,1);
    await page.evaluate(inventory=>{
      const {app}=window.__bincov,r=app.raid,c=r.containers.find(c=>c.kind==='crate');
      r.enemies.forEach(e=>{e.sprite.setPosition(208,1456);e.home={x:208,y:1456};e.target=e.home;e.timer=9999;e.cooldown=9999;e.state='patrol';e.path=[];});
      r.loot.forEach(l=>l.sprite.setPosition(208,1456));r.player.setPosition(c.x,c.y);c.inventory=inventory;
      app.loadout.bag.items=[];r.checkpoint();
    },source);
    await page.keyboard.press('e',{delay:90});await page.locator('.loot-modal').waitFor();
    const own=await box('[data-grid="bag"]'),other=await box('[data-grid="container"]');
    assert.ok(own.x+own.width<other.x,'Carried items must be left of the search source');
    assert.ok(other.x+other.width<=width && other.y+other.height<=height);
    const timer=await page.evaluate(()=>window.__bincov.app.raid.elapsed);await page.waitForTimeout(150);
    assert.ok(await page.evaluate(t=>window.__bincov.app.raid.elapsed>t,timer),'Loot must not pause the raid');
    await shot('loot');
    const uid=source.items.find(i=>i.id==='medkit').uid;
    await page.locator(`[data-uid="${uid}"]`).dragTo(page.locator('[data-grid="bag"]'),{targetPosition:{x:cell*.4,y:cell*.4}});
    assert.equal(await page.locator(`[data-source="bag"][data-uid="${uid}"]`).count(),1);
    await page.locator(`[data-uid="${uid}"]`).dragTo(page.locator('[data-grid="container"]'),{targetPosition:{x:cell*3.4,y:cell*.4}});
    assert.equal(await page.locator(`[data-source="container"][data-uid="${uid}"]`).count(),1);
    check('full viewport loot, own inventory on left, live clock, pointer drag and return at both scales');
    await context.close();
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.externalRequests,[]);report.status='passed';
} catch(error) {report.status='failed';report.failure=error.stack;process.exitCode=1;console.error(error);}
finally {await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
