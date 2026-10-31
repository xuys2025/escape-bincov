// Official site check (pnpm test:site): assembles the Pages tree with the packaged game, serves it and walks the
// homepage in Chromium. Covers the move of the game to play/: every entry link, old root links that carry game
// parameters, hold-to-extract into the game, and the site's WebGL scenes, sprites and interactions without console
// errors, failed requests or external requests. Screenshots go to test-results/site/.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { browserOptions } from '../browser-options.mjs';
import { serve } from './serve.mjs';

const OUT = 'test-results/site';
const TREE = 'test-results/site-pages';
mkdirSync(OUT, { recursive: true });
process.argv.push(`--out=${TREE}`);
const { build } = await import('./build.mjs');
const built = build();
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
assert.equal(hash(`${TREE}/play/index.html`), hash('dist/index.html'), 'play/ must serve the packaged game bytes');

const server = await serve(TREE);
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(browserOptions);
const report = { built, steps: [] };
const step = (name, data = {}) => { report.steps.push({ name, ...data }); console.log(`ok  ${name}`); };

function watch(page, label) {
  const problems = [];
  page.on('pageerror', e => problems.push(`[${label}] pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') problems.push(`[${label}] console: ${m.text()}`); });
  page.on('requestfailed', r => problems.push(`[${label}] failed: ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', r => { if (r.status() >= 400) problems.push(`[${label}] HTTP ${r.status()}: ${r.url()}`); });
  page.on('request', r => { if (!r.url().startsWith(origin) && !r.url().startsWith('data:')) problems.push(`[${label}] external request: ${r.url()}`); });
  return problems;
}
const toSection = (page, id, f) => page.evaluate(([id, f]) => {
  document.documentElement.style.scrollBehavior = 'auto';
  const el = document.getElementById(id);
  scrollTo(0, el.offsetTop + (f == null ? 0 : f * (el.offsetHeight - innerHeight)));
}, [id, f]);

try {
  // ---- Desktop walk-through at the two acceptance sizes ----
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    const tag = `${viewport.width}x${viewport.height}`;
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const problems = watch(page, tag);
    await page.goto(`${origin}/`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('stage').classList.contains('ready'), null, { timeout: 30000 });
    const links = await page.$$eval('a[href]', as => as.map(a => [a.textContent.trim(), a.href]));
    const play = links.filter(([, href]) => href === `${origin}/play/`).map(([t]) => t);
    assert.deepEqual(play.sort(), ['▶ 浏览器里开玩', '出击 →', '直接开始游戏'].sort(), `play links: ${JSON.stringify(links)}`);
    assert.ok(!links.some(([, href]) => /xuys2025\.github\.io\/escape-bincov\/?$/.test(href)), 'no link may point at the old game root');
    await page.waitForFunction(() => getComputedStyle(document.getElementById('stage')).opacity === '1');
    await page.screenshot({ path: `${OUT}/hero-${tag}.png` });
    step(`${tag} hero renders, play links point at play/`);

    await toSection(page, 'top', 0.52);
    await page.waitForFunction(() => { const line = document.querySelector('.story-line.on'); return !!line && getComputedStyle(line).opacity === '1'; }, null, { timeout: 10000 });
    await page.screenshot({ path: `${OUT}/story-${tag}.png` });
    step(`${tag} prologue story line shows`);

    await toSection(page, 'county');
    await page.waitForFunction(() => document.getElementById('countyMap').classList.contains('gl') && document.querySelectorAll('.pin').length === 13, null, { timeout: 30000 });
    await page.locator('.pin', { hasText: '县医院旧址' }).click();
    await page.waitForFunction(() => document.getElementById('briefName').textContent === '县医院旧址');
    await page.evaluate(() => { const s = document.getElementById('tide'); s.value = 85; s.dispatchEvent(new Event('input')); });
    await page.waitForFunction(() => document.querySelectorAll('.pin.flood').length > 0, null, { timeout: 10000 });
    const flooded = await page.$$eval('.pin.flood', p => p.length);
    await page.locator('#countyMap').screenshot({ path: `${OUT}/county-tide85-${tag}.png` });
    step(`${tag} county map: pin selects briefing, high tide floods pins`, { flooded });

    await toSection(page, 'threats');
    await page.waitForFunction(() => [...document.querySelectorAll('#threatStage .sprite')].every(s => s.style.backgroundImage.startsWith('url("data:')), null, { timeout: 10000 });
    await page.locator('.threat-tab', { hasText: '盐蚀者' }).click();
    await page.waitForFunction(() => document.getElementById('threatName').textContent === '盐蚀者');
    await page.waitForFunction(() => { const img = document.querySelector('#threatStage .dossier img'); return img?.complete && img.naturalWidth === 96; }, null, { timeout: 10000 });
    await page.waitForFunction(() => [...document.querySelectorAll('#threatStage .sprite')].length === 2 && [...document.querySelectorAll('#threatStage .sprite')].every(s => s.style.backgroundImage.startsWith('url("data:'))
      && document.getAnimations().every(a => a.effect?.getTiming().iterations === Infinity || a.playState === 'finished'), null, { timeout: 10000 });
    await page.locator('#threatCard').screenshot({ path: `${OUT}/threats-${tag}.png` });
    await toSection(page, 'people');
    const portraits = await page.$$eval('.portrait', els => els.map(e => getComputedStyle(e).backgroundImage));
    assert.equal(portraits.filter(b => /assets\/art\/npc-(xu|shuan|cai)\.png/.test(b)).length, 3, `portraits: ${portraits}`);
    await page.locator('.person').first().hover();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.portrait')).animationName === 'talk');
    await page.screenshot({ path: `${OUT}/people-${tag}.png` });
    step(`${tag} enemy dossier art, in-game sprites from game frames, station portraits talk on hover`);

    await toSection(page, 'bench', 0.98);
    await page.waitForFunction(() => Number(getComputedStyle(document.getElementById('benchStats')).opacity) > 0.9, null, { timeout: 10000 });
    await page.screenshot({ path: `${OUT}/bench-${tag}.png` });
    step(`${tag} gunsmith parts assemble`);

    await toSection(page, 'extract');
    await page.waitForFunction(() => [...document.querySelectorAll('#extractScene img')].every(img => img.complete && img.naturalWidth >= 640), null, { timeout: 15000 });
    await page.screenshot({ path: `${OUT}/extract-${tag}.png` });
    step(`${tag} extraction scene layers load`);
    const button = page.locator('#extractBtn');
    await button.hover();
    await page.mouse.down();
    await page.waitForFunction(() => document.getElementById('extractTitle').textContent === '撤离成功', null, { timeout: 30000 });
    await page.mouse.up();
    await page.waitForURL(`${origin}/play/`, { timeout: 30000 });
    await page.waitForLoadState('load');
    step(`${tag} hold to extract opens the game at play/`);
    assert.deepEqual(problems, []);
    await context.close();
  }

  // ---- Old root links ----
  {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    for (const query of ['?sample=village', '?range=1', '?sample=mall#x']) {
      await page.goto(`${origin}/${query}`, { waitUntil: 'commit' });
      await page.waitForURL(`${origin}/play/${query}`, { timeout: 15000 });
    }
    step('root links with game parameters go on to play/');
    await page.goto(`${origin}/?from=singlemessage&isappinstalled=0`, { waitUntil: 'load' });
    assert.equal(new URL(page.url()).pathname, '/');
    step('share-tracking parameters stay on the site');
    await context.close();
  }

  // ---- Phone and reduced motion ----
  for (const [label, options] of [
    ['phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
    ['reduced-motion', { viewport: { width: 1280, height: 720 }, reducedMotion: 'reduce' }],
  ]) {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    const problems = watch(page, label);
    await page.goto(`${origin}/`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.getElementById('stage').classList.contains('ready'), null, { timeout: 30000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(overflow <= 0, `${label}: horizontal overflow ${overflow}px`);
    const hud = await page.$$eval('.hud > *', els => els.filter(e => getComputedStyle(e).display !== 'none').map(e => Math.round(e.getBoundingClientRect().top)));
    assert.ok(Math.max(...hud) < 30, `${label}: HUD wraps onto a second row (${hud})`);
    await page.waitForFunction(() => getComputedStyle(document.getElementById('stage')).opacity === '1');
    await page.screenshot({ path: `${OUT}/hero-${label}.png` });
    await toSection(page, 'top', 0.6);
    await page.waitForFunction(() => document.querySelector('.story-line.on'), null, { timeout: 10000 });
    await toSection(page, 'county');
    await page.waitForFunction(() => document.querySelectorAll('.pin').length === 13, null, { timeout: 30000 });
    await page.screenshot({ path: `${OUT}/county-${label}.png` });
    assert.deepEqual(problems, []);
    step(`${label}: loads, no horizontal overflow, single-row HUD, story and map work`);
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
  writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
}
console.log(`Site check passed (${report.steps.length} steps); screenshots in ${OUT}/`);
