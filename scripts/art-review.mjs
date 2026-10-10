/** Runtime texture audit; diagnostic atlases are explicitly distinct from game captures. */
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { ITEMS } from '../src/domain.ts';
import { browserOptions } from './browser-options.mjs';

const out = resolve('test-results/art-review');
await mkdir(out, { recursive: true });
const hash = data => createHash('sha256').update(data).digest('hex');
const report = { htmlSha256: hash(await readFile('dist/index.html')), method: 'Actual offline game textures; independent diagnostic atlases at native / 3x sizes. Scene captures use fresh seed 42, an explicitly paused Phaser simulation and positioned player/camera. Rendering remains active. No screenshot editing. actor-headings is a diagnostic Phaser lineup, not natural gameplay.', checks: [], errors: [], externalRequests: [] };
const browser = await chromium.launch(browserOptions);
report.browser = browser.version();
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, offline: true, reducedMotion: 'reduce' });
  context.on('page', page => page.on('pageerror', e => report.errors.push(String(e))));
  context.on('request', req => { if (/^https?:/.test(req.url())) report.externalRequests.push(req.url()); });
  const page = await context.newPage();
  await page.goto(pathToFileURL(resolve('dist/index.html')).href + '?test=1&entry=tabs');
  await page.locator('[data-action="enter"]').waitFor();
  const textures = await page.evaluate(() => {
    const manager = window.__bincov.app.game.textures;
    return Object.keys(manager.list).filter(key => key.startsWith('item-') || key.startsWith('player') || key.startsWith('corpse-') || key.startsWith('portrait-') || key.startsWith('loot') || ['scav','salt','elite','creature','note','bullet'].includes(key)).map(key => {
      const source = manager.get(key).getSourceImage();
      const pixels = source.getContext('2d').getImageData(0,0,source.width,source.height).data;
      let count=0, translucent=0, left=source.width, top=source.height, right=-1, bottom=-1;
      for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++)if(pixels[(y*source.width+x)*4+3]) {count++;if(pixels[(y*source.width+x)*4+3]!==255)translucent++;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
      return { key, width:source.width, height:source.height, occupied:count, translucent, bounds:{x:left,y:top,width:right-left+1,height:bottom-top+1}, png:source.toDataURL() };
    });
  });
  const byKey = Object.fromEntries(textures.map(t => [t.key,t]));
  assert.ok(textures.every(t=>t.occupied>0 && t.translucent===0),'Native pixel sprites must be nonempty without antialiased edges');
  for (const size of [24,32]) {
    const entries = Object.keys(ITEMS).map(id => byKey[`item-${size===24?'small-':''}${id}`]);
    assert.ok(entries.every(t => t && t.width===size && t.height===size && t.occupied>0), `Missing ${size}px item art`);
    assert.equal(new Set(entries.map(t => t.png)).size,Object.keys(ITEMS).length, `Two ${size}px item icons are identical`);
    report.checks.push(`All ${Object.keys(ITEMS).length} ${size}px item textures present, nonempty and unique`);
  }
  const inventoryArt = Object.keys(ITEMS).map(id => byKey[`item-inventory-${id}`]);
  assert.equal(new Set(inventoryArt.map(t => t.png)).size, Object.keys(ITEMS).length);
  report.checks.push(`All ${Object.keys(ITEMS).length} proportioned inventory textures are present and unique`);
  assert.equal(new Set(['player','scav','salt','elite','creature'].map(k=>byKey[k].png)).size,5);
  for(const id of ['scav','salt','elite','creature'])assert.notEqual(byKey[id].png,byKey[`corpse-${id}`].png);
  assert.notEqual(byKey['loot-crate'].png,byKey['loot-crate-empty'].png);
  report.checks.push('Five actor identities, four separate corpses and distinct full/empty crate textures');
  assert.equal(await page.evaluate(()=>document.fonts.check('16px "Bincov Text"','滨科夫水产站')),true);
  const cdp = await context.newCDPSession(page);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const doc = await cdp.send('DOM.getDocument');
  const {nodeId} = await cdp.send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'.title-enter strong'});
  const {fonts} = await cdp.send('CSS.getPlatformFontsForNode',{nodeId});
  assert.ok(fonts.some(f=>f.isCustomFont && f.familyName==='Bincov Text' && f.glyphCount>0),'Visible Chinese text must actually render in the embedded face');
  report.renderedFonts=fonts;
  await cdp.detach();
  report.checks.push('Embedded Bincov Text font ready before the game starts');
  async function atlas(name,cards) {
    const sheet=await context.newPage();await sheet.setViewportSize({width:1280,height:1100});
    await sheet.setContent(`<html lang="zh-CN"><style>*{box-sizing:border-box}body{margin:24px;background:#101c22;color:#eee4c5;font:16px sans-serif}h1{font-size:24px}p{font-size:14px;color:#c1cdbf}main{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}article{padding:12px;background:#1e3035;border-top:2px solid #617a7c;min-height:216px}b{display:block;font-size:16px;margin-bottom:8px}small{display:block;color:#a8c3ba;font:12px monospace}section{display:flex;align-items:center;gap:12px;margin-top:8px;height:100px}.native{height:34px;background:#0e191f}img{image-rendering:pixelated}</style><h1>${name} · 实际运行纹理审查</h1><p>上：原尺寸，下：3× 最近邻诊断放大；本图是纹理排列，不是游戏画面。</p><main></main></html>`);
    await sheet.evaluate(cards=>{for(const card of cards){const a=document.createElement('article'),b=document.createElement('b'),label=document.createElement('small');b.textContent=card.name;label.textContent=card.id;a.append(b,label);for(const scale of [1,3]){const row=document.createElement('section');if(scale===1)row.className='native';row.style.height=`${Math.max(...card.textures.map(t=>t.height))*scale+4}px`;for(const t of card.textures){const img=document.createElement('img');img.src=t.png;img.width=t.width*scale;img.height=t.height*scale;row.append(img);}a.append(row);}document.querySelector('main').append(a);}},cards);
    if (name === 'inventory-items') await sheet.addStyleTag({content:'main{grid-template-columns:repeat(3,1fr)}'});
    await sheet.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));});
    await sheet.screenshot({path:resolve(out,`${name}.png`),fullPage:true});
    await sheet.addStyleTag({content:'article img{filter:grayscale(1)}'});
    await sheet.screenshot({path:resolve(out,`${name}-gray.png`),fullPage:true});
    await sheet.close();
  }
  await atlas('items',Object.entries(ITEMS).map(([id,item])=>({id,name:item.name,textures:[byKey[`item-small-${id}`],byKey[`item-${id}`]]})));
  await atlas('inventory-items',Object.entries(ITEMS).map(([id,item])=>({id,name:item.name,textures:[byKey[`item-inventory-${id}`]]})));
  const dropKeys=new Set(Object.keys(ITEMS).map(id=>`loot-${id}`));
  assert.ok([...dropKeys].every(key=>byKey[key]?.occupied>0));
  assert.equal(new Set([...dropKeys].map(key=>byKey[key].png)).size, Object.keys(ITEMS).length, 'Ground supplies must have distinct object silhouettes');
  await atlas('actors',textures.filter(t=>!t.key.startsWith('item-')&&!dropKeys.has(t.key)).map(t=>({id:t.key,name:t.key,textures:[t]})));
  await atlas('ground-supplies',Object.entries(ITEMS).map(([id,item])=>({id:`loot-${id}`,name:item.name,textures:[byKey[`loot-${id}`]]})));
  report.textures=textures.map(({png,...t})=>({...t,pngSha256:hash(Buffer.from(png.split(',')[1],'base64'))}));
  await page.locator('[data-action="enter"]').click();
  await page.locator('#seed').fill('42');await page.locator('[data-action="deploy"]').click();
  await page.waitForFunction(()=>window.__bincov.app.raid?.player?.active);
  await page.evaluate(()=>window.__bincov.app.raid.scene.pause());
  const worldTexture=await page.evaluate(()=>{
    const manager=window.__bincov.app.game.textures;
    return manager.get(Object.keys(manager.list).find(k=>k.startsWith('bincov-world-'))).getSourceImage().toDataURL();
  });
  await writeFile(resolve(out,'world.png'),Buffer.from(worldTexture.split(',')[1],'base64'));
  const views=[['village',650,464],['market',650,1072],['observatory',1700,600],['harbor',1990,944],['pump',1750,1520],['station',500,1520]];
  report.worldViews=[];
  for(const [width,height] of [[1280,720],[1920,1080]]) {
    await page.setViewportSize({width,height});
    // Resize intentionally opens the game's pause UI; acknowledge it after both resize events.
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.ok(['','pause'].includes(await page.evaluate(()=>window.__bincov.app.overlay)));
    await page.evaluate(()=>window.__bincov.setOverlay(''));
    for(const [name,x,y] of views) {
      await page.evaluate(({x,y})=>{const r=window.__bincov.app.raid;r.player.setPosition(x,y);r.cameras.main.centerOn(x,y);r.updateHud();}, {x,y});
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(()=>window.__bincov.app.overlay),'',`${name}: scene capture blocked by an overlay`);
      await page.screenshot({path:resolve(out,`${width}x${height}-${name}.png`)});
      report.worldViews.push({viewport:{width,height},name,fixture:{x,y}});
    }
    await page.evaluate(()=>{const r=window.__bincov.app.raid;r.highTide=true;r.drawFlood();r.player.setPosition(1940,944);r.cameras.main.centerOn(1940,944);r.updateHud();});
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(()=>window.__bincov.app.overlay),'','High-tide capture blocked by an overlay');
    await page.screenshot({path:resolve(out,`${width}x${height}-high-tide.png`)});
    await page.evaluate(()=>{const r=window.__bincov.app.raid;r.highTide=false;r.drawFlood();});
  }
  // Save/recovery must choose corpse art too, and full-body tint must not darken loose loot.
  await page.evaluate(()=>{const r=window.__bincov.app.raid;for(const id of ['scav','salt','elite','creature']){const e=r.enemies.find(e=>e.id===id);if(e)r.damageEnemy(e,999);}const saved=r.snapshot();r.restore(saved);});
  assert.ok(await page.evaluate(()=>window.__bincov.app.raid.enemies.filter(e=>e.hp<=0).every(e=>e.sprite.texture.key===`corpse-${e.id}`&&e.sprite.alpha===1)));
  assert.ok(await page.evaluate(()=>window.__bincov.app.raid.loot.every(l=>l.sprite.tintTopLeft===0xffffff&&l.sprite.texture.key===`loot-${l.id}`)));
  report.checks.push('Death/checkpoint restore retains corpse art; loose loot body remains untinted');
  const crateState = await page.evaluate(()=>{
    const r=window.__bincov.app.raid,c=r.containers.find(c=>c.kind==='crate'&&c.inventory.items.length);
    const texture=()=>r.containerSprites.find(s=>s.getData('containerId')===c.id).texture.key;
    r.updateHud(); const full=texture();c.inventory.items=[];r.updateHud();const empty=texture();
    const saved=r.snapshot();r.restore(saved);r.updateHud();return {full,empty,restored:texture(),saved:r.checkpoint()};
  });
  assert.deepEqual(crateState,{full:'loot-crate',empty:'loot-crate-empty',restored:'loot-crate-empty',saved:true});
  report.checks.push('Empty crate appearance survives checkpoint restore and a validated write');
  // Actual Phaser render: inspect all five silhouettes at eight headings over the road.
  await page.setViewportSize({width:1280,height:720});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.evaluate(()=>{
    const {app,setOverlay}=window.__bincov;setOverlay('');const r=app.raid;
    r.player.setPosition(650,1072);r.cameras.main.centerOn(650,1072);r.updateHud();r.scene.pause();
    r.add.rectangle(650,1072,720,350,0x29353b).setDepth(80);
    ['player','scav','salt','elite','creature'].forEach((key,row)=>{
      for(let angle=0;angle<8;angle++)r.add.image(370+angle*80,990+row*52,key).setRotation(angle*Math.PI/4).setDepth(81);
    });
  });
  await page.waitForTimeout(200);await page.screenshot({path:resolve(out,'actor-headings.png')});
  // PR16's layered transaction rollback synchronizes existing sprites instead of recreating them.
  const layered = await browser.newContext({ viewport: { width: 1280, height: 720 }, offline: true });
  layered.on('request', req => { if (/^https?:/.test(req.url())) report.externalRequests.push(req.url()); });
  const floor = await layered.newPage(); floor.on('pageerror', e => report.errors.push(String(e)));
  await floor.goto(pathToFileURL(resolve('dist/index.html')).href + '?test=1&entry=tabs');
  await floor.locator('[data-action="enter"]').click(); await floor.locator('#run-world').selectOption('buildings');
  await floor.locator('#seed').fill('42'); await floor.locator('[data-action="deploy"]').click();
  await floor.waitForFunction(() => window.__bincov.app.raid?.player?.active);
  const restoredLayer = await floor.evaluate(() => {
    const r = window.__bincov.app.raid; r.scene.pause();
    r.damageEnemy(r.enemies.find(e => e.hp > 0), 999);
    const c = r.containers.find(c => c.kind === 'crate' && c.inventory.items.length);
    c.inventory.items = []; const checkpoint = r.snapshot(); r.restore(checkpoint); r.updateHud();
    return { corpses: r.enemies.filter(e => e.hp <= 0).map(e => ({ texture: e.sprite.texture.key, expected: `corpse-${e.id}`, alpha: e.sprite.alpha, tint: e.sprite.tintTopLeft })),
      loot: r.loot.map(l => ({ texture: l.sprite.texture.key, expected: `loot-${l.id}`, tint: l.sprite.tintTopLeft })),
      crate: r.containerSprites.find(s => s.getData('containerId') === c.id)?.texture.key, saved: r.checkpoint() };
  });
  assert.ok(restoredLayer.corpses.length > 0 && restoredLayer.corpses.every(e => e.texture === e.expected && e.alpha === 1 && e.tint === 0xffffff));
  assert.ok(restoredLayer.loot.length > 0 && restoredLayer.loot.every(e => e.texture === e.expected && e.tint === 0xffffff));
  assert.equal(restoredLayer.crate, 'loot-crate-empty'); assert.equal(restoredLayer.saved, true);
  report.checks.push('Layered sprite synchronization preserves separate corpse, item and empty crate art and passes strict checkpoint validation');
  await layered.close();
  await context.close();
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.externalRequests,[]);
  report.status='passed';console.log(JSON.stringify({checks:report.checks,textures:textures.length,errors:report.errors,externalRequests:report.externalRequests}));
} finally {await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
