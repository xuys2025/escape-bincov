/**
 * Gunsmith workbench (#28 M2-05, M2-06): the packaged game offline, the real station yard and HideoutRuntime, mouse input.
 * Opens the bench from the weapon slot, item details and the workbench facility; previews never write; confirm writes
 * once; replacing a handguard takes its rail parts along; a smaller magazine unloads into the stash; switching guns or
 * closing with a preview asks first. Screenshots at 1280x720 and 1920x1080. Phones (M2-06, touch): three pages, cancel
 * and confirm in the bottom bar at 844x390, 740x300, 640x300 and 390x844, every step a tap, rotation keeps the preview.
 * A1 compares the game's composites with Sol's approved previews pixel by pixel: M2's, wave one's and wave two's P0
 * (#28 M3-04, M3-07). Fixtures use the session with ?test=1.
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import { reportFilter, stepFilter } from './step-filter.mjs';
import * as D from '../src/domain.ts';
import { factoryState } from '../src/gunsmith/instance.ts';
import { CONFIGS, part as partNode } from '../tests/fixtures/gunsmith-configs.ts';

const option = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const htmlPath = option('html', 'dist/index.html'), html = await readFile(htmlPath, 'utf8');
const out = resolve(option('out', 'test-results/gunsmith-bench')), filter = stepFilter();
await mkdir(out, { recursive: true });
const browser = await chromium.launch(browserOptions);
const report = { build: htmlPath, sha256: createHash('sha256').update(html).digest('hex'), browser: browser.version(), startedAt: new Date().toISOString(),
  methodology: 'Packaged HTML offline; real mouse input on the station yard, its HideoutRuntime, SaveSession and localStorage. Fixtures use the session transaction with ?test=1.', steps: [], errors: [], external: [], screenshots: [] };
let context, page, mobile = false;
const yard = s => page.locator(`#station-yard ${s}`);
const bench = s => yard(`.modal.k-gunsmith ${s}`);
const snapshot = () => page.evaluate(() => window.__bincov.hideoutRuntime.snapshot());
const raw = () => page.evaluate(() => localStorage.getItem('escape-bincov.session.v2'));
const ready = () => page.waitForFunction(() => window.__station?.mounted && window.__station.host.frames > 8);
const shot = async name => { await page.screenshot({ path: resolve(out, `${name}.png`) }); report.screenshots.push(`${name}.png`); };
const GUN = 'gun-bench-m4';

/** M4A1 equipped with 28 rounds; a G17 and ten sample parts in the stash; spare rounds in the bag. */
function fixture() {
  const p = D.newSave(); p.stash = D.createInventory(D.STASH_W, D.STASH_ROWS); p.bag = D.createInventory(6, 5); p.safe = D.createInventory(2, 2); p.cash = 900;
  p.equipment = { weapon: 'mb4a1', weaponUid: GUN, gun: factoryState(), ammo: 28, ammoRelief: 0, relief: false };
  for (const id of ['gb17', 'O03', 'O08', 'H01', 'F01', 'T01', 'G10', 'S01', 'B01', 'M03']) assert.equal(D.addItem(p.stash, id), 0, id);
  assert.equal(D.addItem(p.bag, 'ammoR', 30), 0);
  return p;
}
async function seed(p) {
  await page.evaluate(async p => {
    await window.__station.reseed(() => {
      const s = window.__bincov.saveSession, t = s.prepareExpansionMutation(d => {
        for (const key of ['cash', 'stash', 'bag', 'safe', 'equipment', 'upgraded']) d.profile[key] = structuredClone(p[key]);
      });
      if (s.commitExpansionMutation(t) !== 'committed') throw Error('fixture did not commit');
    });
  }, p);
  await ready();
}
async function open(p = fixture(), size = [1280, 720]) {
  await context?.close();
  mobile = size[0] < 900 || size[1] < 560;
  context = await browser.newContext({ offline: true, viewport: { width: size[0], height: size[1] }, deviceScaleFactor: 1, hasTouch: mobile, isMobile: mobile });
  await context.route('https://station.test/**', r => r.fulfill({ contentType: 'text/html', body: html }));
  context.on('request', r => { if (/^https?:/.test(r.url()) && !r.url().startsWith('https://station.test/')) report.external.push(r.url()); });
  page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', e => report.errors.push(String(e.stack)));
  page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  await page.goto('https://station.test/?test=1'); await page.locator('[data-action="enter"]').click(); await ready(); await seed(p);
}
const tap = el => mobile ? el.tap() : el.click();
async function quick(kind) {
  const btn = yard(`[data-quick="${kind}"]`); if (!await btn.isVisible()) await tap(yard('[data-quickmenu]'));
  await tap(btn);
}
/** From the weapon slot of the gear panel. */
async function openFromSlot() {
  await quick('gear'); await tap(yard(`[data-act="gunsmith:${GUN}"]`)); await bench('.gs').waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
    const m = document.querySelector('#station-yard').shadowRoot.querySelector('.modal.k-gunsmith');
    await Promise.all(m.getAnimations().map(a => a.finished.catch(() => {})));
  });
}
const pos = key => bench(`[data-gs="pos"][data-arg="${key}"]`);
const part = id => bench(`.gs-list [data-gs="part"][data-arg="${id}"]`);
const equipped = async () => (await snapshot()).profile.equipment;
/** The whole bench inside the viewport, no horizontal scroll, the confirm and cancel buttons visible. */
async function fits() {
  const size = page.viewportSize();
  for (const sel of ['.gs', '[data-gs="confirm"]', '[data-gs="cancel"]', '.gs-stats h3']) {
    const r = await bench(sel).boundingBox();
    assert.ok(r && r.x >= -1 && r.y >= -1 && r.x + r.width <= size.width + 1 && r.y + r.height <= size.height + 1, `${sel} outside the viewport`);
  }
  assert.equal(await bench('.gs').evaluate(e => e.scrollWidth > e.clientWidth + 1), false, 'bench scrolls sideways');
  // The bar never scrolls or spills (maintainer, 2026-10-27): its parts fit its fixed height.
  const spill = await bench('.gs-foot').evaluate(f => [f, ...f.querySelectorAll('.gs-pend, .gs-fx')].filter(e => e.scrollHeight > e.clientHeight + 1).map(e => e.className));
  assert.deepEqual(spill, [], 'the bar scrolls');
}
/** Phones: the header, the page and the bottom bar inside the screen, nothing scrolls sideways, cancel and confirm are on top. */
async function phoneFits() {
  const size = page.viewportSize();
  if (process.env.GS_BOXES) console.log(await page.evaluate(await readFile(process.env.GS_BOXES, 'utf8')));
  for (const sel of ['.gs-ctop', '.gs-cfoot', '[data-gs="confirm"]', '[data-gs="cancel"]', '[data-gs="close"]']) {
    const r = await bench(sel).boundingBox();
    assert.ok(r && r.x >= -1 && r.y >= -1 && r.x + r.width <= size.width + 1 && r.y + r.height <= size.height + 1, `${sel} outside ${size.width}x${size.height}`);
  }
  for (const sel of ['.gs', '.gs-cpage']) assert.equal(await bench(sel).evaluate(e => e.scrollWidth > e.clientWidth + 1), false, `${sel} scrolls sideways`);
  // Looked up and hit-tested in one evaluation: the yard's five-second checkpoint may repaint the panel between calls.
  assert.ok(await page.evaluate(() => {
    const root = document.querySelector('#station-yard').shadowRoot, el = root.querySelector('.modal.k-gunsmith [data-gs="confirm"]');
    const r = el.getBoundingClientRect(), hit = root.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit === el || el.contains(hit);
  }), 'confirm is covered');
}
const phonePage = async name => { await tap(bench(`.gs-tabs [data-gs="page"][data-arg="${name}"]`)); await bench(`.gs-cpage.gs-p-${name}`).waitFor(); };
async function step(name, fn) {
  if (!filter.selects(name)) return;
  const row = { name }, errorStart = report.errors.length; report.steps.push(row);
  try { row.detail = await fn(); assert.deepEqual(report.errors.slice(errorStart), []); assert.deepEqual(report.external, []);
    assert.deepEqual(await page.evaluate(() => window.__station?.host?.errors ?? []), []); row.status = 'passed'; console.log('PASS', name);
  } catch (e) { row.status = 'failed'; row.error = String(e.stack); await shot(`failure-${report.steps.length}`).catch(() => {}); console.log('FAIL', name, e.message); }
}

try {
  await step('A1-composites-equal-the-approved-previews', async () => {
    // M2-10: every approved preview assembly (Sol, M2-09) drawn by the game's compositor in the packaged page, compared
    // with the preview PNG channel by channel. #28 M3-04 adds Sol's wave-one records and M3-08 wave two's, each against
    // its 1x preview, and the bare side views (the ground and the HUD card) where Sol drew one. M3-12 redrew the
    // magazines (M3-W3): a picture with one is compared outside the region each redrawn image changed, at the same width;
    // the new magazines' layouts are checked against Sol's M3-W3 records in tests/gunsmith-art.test.ts.
    const { redrawn } = JSON.parse(await readFile('tests/fixtures/gunsmith-m3-w3-redrawn.json', 'utf8'));
    const { assemblies } = JSON.parse(await readFile('tests/fixtures/gunsmith-assemblies.json', 'utf8'));
    const cases = await Promise.all(assemblies.map(async a => ({ name: `${a.gun}-${a.configuration}-${a.code}`, gun: a.gun, code: a.code,
      parts: CONFIGS[a.gun][a.configuration](), png: (await readFile(a.file)).toString('base64') })));
    const grow = trees => trees.map(([id, slot, kids]) => partNode(id, slot, grow(kids ?? [])));
    // Sol drew wave one's factory Vector before the receiver's front glove (ART-SPEC 5; d3eb43f): the glove is checked on
    // its own. The approved P0 AUG preview keeps its pixels too; its glove version is `-front-glove` (92f7a7f), compared whole.
    const beforeGlove = ['tests/fixtures/gunsmith-assemblies-m3.json:vb9-factory-h'];
    const previewOf = (dir, name) => existsSync(`${dir}/${name}-front-glove-1x.png`) ? `${dir}/${name}-front-glove-1x.png` : `${dir}/${name}-1x.png`;
    for (const [file, dir] of [['tests/fixtures/gunsmith-assemblies-m3.json', 'docs/gunsmith/art/m3-w1/preview'], ['tests/fixtures/gunsmith-assemblies-m3-w2.json', 'docs/gunsmith/art/m3-w2/preview']]) {
      const wave = JSON.parse(await readFile(file, 'utf8'));
      for (const a of wave.assemblies) {
        const name = `${a.gun}-${a.configuration}-${a.code}`;
        cases.push({ name, gun: a.gun, code: a.code, parts: grow(wave.configurations[a.gun][a.configuration]), png: (await readFile(previewOf(dir, name))).toString('base64'), dropFrontGlove: beforeGlove.includes(`${file}:${name}`) });
      }
      for (const b of wave.bareFactories) {
        const png = `${dir}/${b.gun}-factory-ground-hud-1x.png`;
        if (existsSync(png)) cases.push({ name: `${b.gun}-bare`, gun: b.gun, code: 'h', parts: [], png: (await readFile(png)).toString('base64'), bare: true });
      }
    }
    await open();
    const { out: bad, partial } = await page.evaluate(async ([cases, redrawn]) => {
      const art = window.__bincov.gunsmithArt, out = [];
      let partial = 0;
      for (const c of cases) {
        let layout = art.layout(c.gun, c.parts, c.code, !c.bare);
        if (layout && c.dropFrontGlove) {
          if (!layout.layers.some(l => l.label === 'glove-front')) out.push(`${c.name}: no front glove on the receiver's hand`);
          layout = { ...layout, layers: layout.layers.filter(l => l.label !== 'glove-front') };
        }
        const canvas = layout && art.draw(layout);
        if (!canvas) { out.push(`${c.name}: not drawn`); continue; }
        const img = new Image(); img.src = `data:image/png;base64,${c.png}`; await img.decode();
        const masks = layout.layers.filter(l => redrawn[l.key]).map(l => { const [x, y, w, h] = redrawn[l.key]; return [l.x + x, l.y + y, w, h]; });
        if (img.width !== canvas.width || (!masks.length && img.height !== canvas.height)) { out.push(`${c.name}: ${canvas.width}x${canvas.height}, preview ${img.width}x${img.height}`); continue; }
        const ref = document.createElement('canvas'); ref.width = img.width; ref.height = img.height;
        const rc = ref.getContext('2d'); rc.drawImage(img, 0, 0);
        const w = img.width, h = Math.min(img.height, canvas.height);
        const a = canvas.getContext('2d').getImageData(0, 0, w, h).data, b = rc.getImageData(0, 0, w, h).data;
        const masked = (x, y) => masks.some(([mx, my, mw, mh]) => x >= mx && x < mx + mw && y >= my && y < my + mh);
        let diff = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && !masked((i >> 2) % w, Math.floor((i >> 2) / w))) diff++;
        if (diff) out.push(`${c.name}: ${diff} channel values differ`);
        if (masks.length) partial++;
      }
      return { out, partial };
    }, [cases, redrawn]);
    assert.deepEqual(bad, []);
    return { compared: cases.length, outsideRedrawnMagazines: partial };
  });

  await step('B1-preview-writes-nothing-confirm-writes-once', async () => {
    await open(); await openFromSlot(); await fits();
    const before = await raw();
    await pos('gun/top/0').click(); await part('O08').click();
    await bench('.gs-badge').waitFor();
    assert.match(await bench('.gs-badge').innerText(), /1 处改动/);
    assert.match(await bench('.gs-foot').innerText(), /轻型远距镜/);
    assert.equal(await raw(), before, 'a preview writes nothing');
    assert.deepEqual((await equipped()).gun.parts, []);
    await shot('01-desktop-1280x720-preview');
    await bench('[data-gs="cancel"]').click();
    assert.equal(await bench('.gs-badge').count(), 0);
    await part('O08').click(); await bench('[data-gs="confirm"]').click();
    await page.waitForFunction(() => window.__bincov.hideoutRuntime.snapshot().profile.equipment.gun.parts.length === 1);
    const e = await equipped(); assert.equal(e.gun.parts[0].id, 'O08');
    assert.equal(D.count((await snapshot()).profile.stash, 'O08'), 0, 'the scope left the stash');
    assert.equal(await bench('.gs-badge').count(), 0, 'no preview after the commit');
    assert.notEqual(await raw(), before);
  });

  await step('B2-handguard-rails-magazine-unload', async () => {
    await open(); await openFromSlot();
    // Closed until a railed handguard is on.
    assert.match(await pos('gun/under/0').innerText(), /需要 AR 短导轨护木/);
    await pos('gun/handguard/0').click(); await part('H01').click();
    const h01 = (await bench('.gs-foot').innerText()); assert.match(h01, /AR 短导轨护木/);
    const keys = await bench('[data-gs="pos"]').evaluateAll(els => els.map(e => e.dataset.arg));
    const under = keys.find(k => k.endsWith('/under/0') && !k.startsWith('gun/')), side = keys.find(k => k.endsWith('/side/0') && !k.startsWith('gun/'));
    assert.ok(under && side, `rail positions: ${keys}`);
    await pos(under).click(); await part('F01').click();
    await pos(side).click(); await part('T01').click();
    await pos('gun/mag/0').click(); await part('G10').click();
    const foot = await bench('.gs-foot').innerText();
    assert.match(foot, /卸出 8 发卡宾枪弹/); assert.match(await bench('.gs-head').innerText(), /30 → 20 发/, 'the magazine before → after is in the header');
    assert.match(await bench('.gs-badge').innerText(), /4 处改动/);
    await bench('[data-gs="detail"]').click(); assert.match(await bench('.gs-stats').innerText(), /弹匣 30 发 → 20 发/);
    await shot('02-desktop-1280x720-mid-edit'); await fits();
    await bench('[data-gs="confirm"]').click();
    await page.waitForFunction(() => window.__bincov.hideoutRuntime.snapshot().profile.equipment.gun.parts.length === 2);
    const e = await equipped(), p = (await snapshot()).profile;
    assert.equal(e.ammo, 20); assert.equal(D.count(p.stash, 'ammoR'), 8);
    assert.deepEqual(e.gun.parts.map(n => [n.id, n.children.map(c => c.id).sort()]).sort(), [['G10', []], ['H01', ['F01', 'T01']]]);
    // Back to the factory handguard: the foregrip and the laser come off with it.
    await pos('gun/handguard/0').click(); await bench('.gs-list [data-gs="part"][data-arg=""]').click();
    const rem = await bench('.gs-foot').innerText();
    assert.match(rem, /短垂直前握把/); assert.match(rem, /随AR 短导轨护木拆下|随 AR 短导轨护木拆下/);
    await bench('[data-gs="cancel"]').click();
  });

  await step('B3-refusal-and-switch-guns-asks-first', async () => {
    await open(); await openFromSlot();
    await pos('gun/top/0').click(); await part('O03').click(); await bench('.gs-badge').waitFor();
    const g17 = (await snapshot()).profile.stash.items.find(i => i.id === 'gb17').uid;
    await bench(`[data-gs="gun"][data-arg="${g17}"]`).click();
    await bench('.gs-dialog').waitFor(); await shot('03-desktop-1280x720-switch-dialog');
    await bench('[data-gs="leave-stay"]').click(); assert.equal(await bench('.gs-dialog').count(), 0);
    assert.match(await bench('.gs-badge').innerText(), /1 处改动/, 'staying keeps the preview');
    await bench(`[data-gs="gun"][data-arg="${g17}"]`).click(); await bench('[data-gs="leave-discard"]').click();
    assert.match(await bench('.gs-head').innerText(), /G17/);
    assert.equal(await bench('.gs-badge').count(), 0);
    // A suppressor before the barrel group: refused with the reason, nothing previewed.
    await pos('gun/muzzle/0').click(); await part('M03').click();
    assert.match(await bench('.gs-refuse').innerText(), /需要九系精瞄枪管组/);
    assert.equal(await bench('.gs-badge').count(), 0);
    await pos('gun/barrel/0').click(); await part('B01').click();
    await pos('gun/muzzle/0').click(); await part('M03').click();
    assert.match(await bench('.gs-badge').innerText(), /2 处改动/);
    await bench('[data-gs="detail"]').click(); assert.match(await bench('.gs-stats').innerText(), /510 → 255/);
    await shot('04-desktop-1280x720-g17');
    // The maintainer's case (2026-10-27): four changes, two of them not owned, and a refusal; the bar still fits.
    await bench('[data-gs="detail"]').click(); await bench('[data-gs="unowned"]').click();
    await pos('gun/micro/0').click(); await part('O01').click();
    await pos('gun/mag/0').click(); await part('G01').click();
    assert.match(await bench('.gs-badge').innerText(), /4 处改动/); assert.match(await bench('.gs-fx').innerText(), /放不下|买到|未拥有/);
    await shot('04b-desktop-1280x720-g17-four'); await fits();
    // Esc with a preview asks; Esc again stays; discarding closes back to the gear panel.
    await page.keyboard.press('Escape'); await bench('.gs-dialog').waitFor();
    await page.keyboard.press('Escape'); assert.equal(await bench('.gs-dialog').count(), 0);
    await page.keyboard.press('Escape'); await bench('[data-gs="leave-discard"]').click();
    await yard('.panel.k-gear').waitFor(); assert.equal(await yard('.modal.k-gunsmith').isVisible(), false);
  });

  await step('B4-entries-details-and-workbench', async () => {
    await open();
    await quick('gear');
    const g17 = (await snapshot()).profile.stash.items.find(i => i.id === 'gb17').uid;
    await yard(`[data-grid="stash"] [data-uid="${g17}"]`).click(); await yard('.details [data-act="gunsmith"]').click();
    await bench('.gs').waitFor(); assert.match(await bench('.gs-head').innerText(), /G17/);
    await yard('.modal.k-gunsmith .phead [data-act="close"]').click();
    await yard('.panel.k-gear').waitFor();
    await yard('[data-tab="facility"]').click(); await yard('[data-act="fac:workbench"]').click(); await yard('.bench-entry [data-act="gunsmith"]').click();
    await bench('.gs').waitFor(); assert.match(await bench('.gs-head').innerText(), /M4A1/);
  });

  await step('B6-old-tab-page-same-panel', async () => {
    await open(); await yard('[data-tabs]').click();
    await page.locator('[data-action="gunsmith-open"]').first().click();
    const old = s => page.locator(`.gs-page ${s}`);
    await old('.gs').waitFor(); await page.evaluate(() => document.fonts.ready);
    await old('[data-gs="pos"][data-arg="gun/top/0"]').click(); await old('.gs-list [data-gs="part"][data-arg="O03"]').click();
    assert.match(await old('.gs-badge').innerText(), /1 处改动/);
    await shot('06-tab-page-1280x720');
    await old('[data-gs="confirm"]').click();
    await page.waitForFunction(() => window.__bincov.hideoutRuntime.snapshot().profile.equipment.gun.parts.length === 1);
    assert.equal((await equipped()).gun.parts[0].id, 'O03');
    await old('[data-gs="pos"][data-arg="gun/mag/0"]').click(); await old('.gs-list [data-gs="part"][data-arg="G10"]').click();
    await page.keyboard.press('Escape'); await old('.gs-dialog').waitFor();
    await old('[data-gs="leave-discard"]').click(); assert.equal(await page.locator('.gs-page').count(), 0);
  });

  await step('P1-phone-844x390-pages-taps-rotation', async () => {
    await open(fixture(), [844, 390]); await openFromSlot();
    assert.equal(await bench('.gs.gs-compact').count(), 1); await phoneFits();
    assert.equal(await yard('.modal.k-gunsmith > .phead').isVisible(), false, 'the bench brings its own header');
    await shot('07-phone-844x390-body');
    // A position on the body page opens the parts page for it.
    await tap(pos('gun/top/0')); await bench('.gs-cpage.gs-p-parts').waitFor();
    assert.match(await bench('.gs-tabs [data-arg="parts"]').innerText(), /瞄具/);
    await tap(part('O08')); await phoneFits();
    assert.match(await bench('.gs-sumbtn').innerText(), /待装 1/);
    await shot('08-phone-844x390-parts');
    await phonePage('stats'); assert.match(await bench('.gs-stats').innerText(), /精度/); await phoneFits();
    await tap(bench('.gs-sumbtn')); await bench('.gs-sheet').waitFor();
    assert.match(await bench('.gs-sheet').innerText(), /轻型远距镜/);
    await shot('09-phone-844x390-sheet');
    await tap(bench('.gs-sheet [data-gs="sheet"]')); assert.equal(await bench('.gs-sheet').count(), 0);
    // Turning the phone keeps the preview and the page.
    await page.setViewportSize({ width: 390, height: 844 }); await bench('.gs.gs-compact').waitFor();
    assert.match(await bench('.gs-sumbtn').innerText(), /待装 1/); await phoneFits();
    await page.setViewportSize({ width: 844, height: 390 });
    assert.equal((await equipped()).gun.parts.length, 0, 'nothing written yet');
    await tap(bench('[data-gs="confirm"]'));
    await page.waitForFunction(() => window.__bincov.hideoutRuntime.snapshot().profile.equipment.gun.parts.length === 1);
    assert.equal((await equipped()).gun.parts[0].id, 'O08');
  });

  for (const size of [[740, 300], [640, 300]]) await step(`P2-phone-${size[0]}x${size[1]}-short`, async () => {
    await open(fixture(), size); await openFromSlot(); await phoneFits();
    await tap(pos('gun/mag/0')); await tap(part('G10')); await phoneFits();
    assert.match(await bench('.gs-sumbtn').innerText(), /卸出 8 发/);
    await shot(`10-phone-${size[0]}x${size[1]}-parts`);
    await phonePage('body'); await phoneFits();
    await shot(`11-phone-${size[0]}x${size[1]}-body`);
    await tap(bench('[data-gs="cancel"]')); assert.match(await bench('.gs-sumbtn').innerText(), /还没有改动/);
  });

  await step('P3-phone-390x844-switch-and-close-ask', async () => {
    await open(fixture(), [390, 844]); await openFromSlot(); await phoneFits();
    await shot('12-phone-390x844-body');
    await tap(pos('gun/handguard/0')); await tap(part('H01'));
    await shot('13-phone-390x844-parts');
    await phonePage('stats'); await tap(bench('[data-gs="detail"]')); await shot('14-phone-390x844-stats');
    await phonePage('body');
    const g17 = (await snapshot()).profile.stash.items.find(i => i.id === 'gb17').uid;
    await tap(bench(`[data-gs="gun"][data-arg="${g17}"]`)); await bench('.gs-dialog').waitFor();
    await tap(bench('[data-gs="leave-stay"]')); assert.match(await bench('.gs-sumbtn').innerText(), /待装 1/);
    await tap(bench('.gs-ctop [data-gs="close"]')); await bench('.gs-dialog').waitFor();
    await tap(bench('[data-gs="leave-discard"]')); assert.equal(await yard('.modal.k-gunsmith').isVisible(), false);
  });

  await step('P4-phone-390x844-old-tab-page', async () => {
    await open(fixture(), [390, 844]);
    const tabs = yard('[data-tabs]'); if (!await tabs.isVisible()) await tap(yard('[data-quickmenu]'));
    // The phone tab page shows the equipment card under its own container tab.
    await tap(tabs); await tap(page.locator('[data-action="container"][data-id="safe"]')); await tap(page.locator('[data-action="gunsmith-open"]').first());
    const old = s => page.locator(`.gs-page ${s}`);
    await old('.gs.gs-compact').waitFor();
    await tap(old('[data-gs="pos"][data-arg="gun/top/0"]')); await tap(old('.gs-list [data-gs="part"][data-arg="O03"]'));
    assert.match(await old('.gs-sumbtn').innerText(), /待装 1/);
    const size = page.viewportSize(), r = await old('[data-gs="confirm"]').boundingBox();
    assert.ok(r && r.y + r.height <= size.height + 1, 'confirm on screen');
    await shot('15-phone-390x844-tab-page');
    await tap(old('[data-gs="confirm"]'));
    await page.waitForFunction(() => window.__bincov.hideoutRuntime.snapshot().profile.equipment.gun.parts.length === 1);
    await tap(old('.gs-ctop [data-gs="close"]')); assert.equal(await page.locator('.gs-page').count(), 0);
  });

  await step('B7-presets-save-apply-rename-missing-delete', async () => {
    await open(); await openFromSlot();
    const presets = () => page.evaluate(() => window.__bincov.hideoutRuntime.snapshot().profile.gunPresets ?? []);
    const card = name => bench('.gs-preset').filter({ hasText: name });
    // The preview saved as a preset: ids and slots, under the default name.
    await pos('gun/top/0').click(); await part('O03').click(); await pos('gun/stock/0').click(); await part('S01').click();
    await bench('[data-gs="preset-save"]').click();
    assert.deepEqual((await presets()).map(p => [p.name, p.parts.map(n => n.id).sort()]), [['M4A1 配装 1', ['O03', 'S01']]]);
    assert.match(await card('M4A1 配装 1').innerText(), /预览中/);
    await bench('[data-gs="cancel"]').click();
    assert.match(await card('M4A1 配装 1').innerText(), /可以应用/);
    // Applying only previews; confirm commits.
    await card('M4A1 配装 1').locator('[data-gs="preset-apply"]').click();
    assert.match(await bench('.gs-badge').innerText(), /2 处改动/);
    assert.deepEqual((await equipped()).gun.parts, []);
    await bench('[data-gs="confirm"]').click();
    await page.waitForFunction(() => window.__bincov.hideoutRuntime.snapshot().profile.equipment.gun.parts.length === 2);
    assert.match(await card('M4A1 配装 1').innerText(), /装着这套/);
    assert.equal(await card('M4A1 配装 1').locator('[data-gs="preset-apply"]').isDisabled(), true);
    // Rename in place: the field takes the keyboard, Enter saves.
    await card('M4A1 配装 1').locator('[data-gs="preset-rename"]').click();
    const field = bench('.gs-rename input');
    assert.equal(await field.evaluate(el => el.getRootNode().activeElement === el), true, 'the field has the keyboard');
    await field.fill('轻快'); await field.press('Enter');
    await card('轻快').waitFor();
    assert.deepEqual((await presets()).map(p => p.name), ['轻快']);
    // A preset with a part nobody has: listed, not applicable.
    await page.evaluate(() => window.__bincov.hideoutRuntime.savePreset('mb4a1', [{ id: 'P02', slot: 'grip', children: [] }], '稳握'));
    await bench('[data-gs="detail"]').click(); await bench('[data-gs="detail"]').click();
    assert.match(await card('稳握').innerText(), /缺 1 件/);
    assert.equal(await card('稳握').locator('[data-gs="preset-apply"]').isDisabled(), true);
    await card('稳握').locator('[data-gs="preset-missing"]').click();
    assert.match(await card('稳握').innerText(), /AR 稳握把/);
    await shot('16-desktop-1280x720-presets');
    // Delete asks once more.
    await card('稳握').locator('[data-gs="preset-delete"]').click();
    assert.equal((await presets()).length, 2, 'the first tap only asks');
    await card('稳握').locator('[data-gs="preset-delete"]').click();
    assert.deepEqual((await presets()).map(p => p.name), ['轻快']);
    const raw = JSON.parse(await page.evaluate(() => localStorage.getItem('escape-bincov.session.v2')));
    assert.deepEqual(raw.profile.gunPresets.map(p => p.name), ['轻快'], 'written to the save');
  });

  await step('B8-art-pictures-and-bounded-caches', async () => {
    // A G17 with its barrel group, suppressor, sight and long magazine in the bag: its cell shows the composite (58 x 25).
    const p = fixture();
    p.bag.items.push({ uid: 'g17-custom', id: 'gb17', qty: 1, x: 0, y: 2, gun: { parts: [
      { uid: 'c-b01', id: 'B01', slot: 'barrel', relief: false, children: [] }, { uid: 'c-m03', id: 'M03', slot: 'muzzle', relief: false, children: [] },
      { uid: 'c-o01', id: 'O01', slot: 'micro', relief: false, children: [] }, { uid: 'c-g01', id: 'G01', slot: 'mag', relief: false, children: [] }], devices: { laser: false, light: false } } });
    await open(p); await quick('gear');
    const cell = yard('[data-grid="bag"] [data-uid="g17-custom"] img');
    assert.equal(await cell.evaluate(img => img.naturalWidth), 58, 'the configured G17 shows its own picture');
    const caches = () => page.evaluate(() => window.__bincov.gunsmithArt.caches());
    for (let i = 0; i < 20; i++) {
      await yard(`[data-act="gunsmith:${GUN}"]`).click(); await bench('.gs').waitFor();
      assert.equal(await bench('.gs-stage .gs-bench-art').count(), 1, 'the stage shows the workbench picture');
      const before = await bench('.gs-bench-art').getAttribute('src');
      await pos('gun/top/0').click(); await part(i % 2 ? 'O03' : 'O08').click();
      assert.notEqual(await bench('.gs-bench-art').getAttribute('src'), before, 'the picture follows the preview');
      const during = await caches();
      assert.ok(during.bench <= 4 && during.inventory <= 64, JSON.stringify(during));
      await bench('[data-gs="cancel"]').click();
      await yard('.modal.k-gunsmith .phead [data-act="close"]').click(); await yard('.panel.k-gear').waitFor();
      assert.equal((await caches()).bench, 0, 'closing the workbench drops its pictures');
    }
    return await caches();
  });

  await step('S1-shop-filters-details-and-sale-preview', async () => {
    // A G17 with a barrel group in the stash, so the shop can price it part by part.
    const p = fixture();
    const g17 = p.stash.items.find(i => i.id === 'gb17');
    g17.gun = { parts: [{ uid: 's-b01', id: 'B01', slot: 'barrel', relief: false, children: [] }], devices: { laser: false, light: false } };
    p.stash.items = p.stash.items.filter(i => i.id !== 'B01');
    await open(p);
    // Gear details: a modified gun lists its parts and sells as its body plus parts, not the factory price.
    await quick('gear'); await yard(`[data-grid="stash"] [data-uid="${g17.uid}"]`).click();
    const details = await yard('.details').innerText();
    assert.match(details, /已装：九系精瞄枪管组/);
    assert.match(details, new RegExp(`售价\\s*¥ ${D.ITEMS.gb17.sell + D.ITEMS.B01.sell}`), 'body plus part');
    // An attachment's details name the gun at the base that takes it and what another lacks.
    const f01 = (await snapshot()).profile.stash.items.find(i => i.id === 'F01').uid;
    await yard(`[data-grid="stash"] [data-uid="${f01}"]`).click();
    assert.match(await yard('.details').innerText(), /装在M4A1 模块步枪（装备中）上：需要 AR 短导轨护木/);
    await shot('20-desktop-1280x720-part-details');
    // The arms counter: all, one kind, only what fits; the lists stay.
    await yard('[data-tab="arms"]').click(); await yard('.seg.browse').waitFor();
    const catalog = () => page.evaluate(() => [...document.querySelector('#station-yard').shadowRoot.querySelectorAll('[data-grid="merchant"] .item')].map(e => e.classList.contains('k-attachment')));
    const all = (await catalog()).length;
    // The stock runs onto a second page (#28 M3), so a page of parts alone can hold more than the first page of all.
    await yard('.seg.browse [data-act="browse-kind:attachment"]').click();
    const shown = await catalog(), parts = shown.length;
    assert.ok(parts > 0 && shown.every(Boolean), `${parts} parts, all attachments`);
    await yard('.seg.browse [data-act="browse-fits"]').click();
    const fitting = (await catalog()).length;
    assert.ok(fitting > 0 && fitting < parts, 'A07 is the carbine\'s: it goes');
    await shot('17-desktop-1280x720-shop-filter');
    await yard('.seg.browse [data-act="browse-fits"]').click(); await yard('.seg.browse [data-act="browse-kind:all"]').click();
    assert.equal((await catalog()).length, all, 'back to the whole stock');
    // The sale preview: the G17 in the stash lists its body and part.
    await yard(`[data-grid="stash"] [data-uid="${g17.uid}"]`).click();
    const sale = await yard('.details').innerText();
    assert.match(sale, /枪身 G17 通用手枪：¥ \d+/); assert.match(sale, /配件 九系精瞄枪管组：¥ \d+/);
    await shot('18-desktop-1280x720-sale-preview');
  });

  await step('S2-tab-page-shop-filter-and-phone-shop', async () => {
    await open();
    await yard('[data-tabs]').click();
    await page.locator('[data-action="tab"][data-id="arms"]').click();
    await page.locator('.shop-browse').waitFor();
    const count = () => page.locator('[data-grid="merchant"] .item').count(), all = await count();
    await page.locator('.shop-browse [data-id="kind:ammo"]').click();
    assert.equal(await count(), 6, 'the six rounds (#28 M3-05)');
    await page.locator('.shop-browse [data-id="kind:all"]').click();
    assert.equal(await count(), all);
    // Phones: the buy pane carries the same filter.
    await open(fixture(), [844, 390]);
    const tabs = yard('[data-quick="arms"]'); if (!await tabs.isVisible()) await tap(yard('[data-quickmenu]'));
    await tap(tabs); await yard('.seg.browse').waitFor();
    await tap(yard('.seg.browse [data-act="browse-kind:attachment"]'));
    assert.ok(await yard('[data-grid="merchant"] .item').count() > 0);
    await shot('19-phone-844x390-shop-filter');
  });

  await step('Y1-yard-import-survives-the-checkpoint-repaint', async () => {
    // A player takes seconds in the file dialog; the yard's five-second checkpoint repaints the open menu meanwhile. The
    // file input lives outside the menu, so the chosen file still reaches the import (it used to be lost silently).
    await open();
    const backup = await page.evaluate(() => { const r = JSON.parse(localStorage.getItem('escape-bincov.session.v2')); return JSON.stringify({ format: 'escape-bincov-recovery-backup', formatVersion: r.version, record: r }); });
    const p = fixture(); p.cash = 123; await seed(p);
    await page.keyboard.press('Escape'); await yard('.modal.k-menu').waitFor();
    await yard('.modal.k-menu [data-act="import"]').evaluate(b => { b.dataset.before = '1'; });
    const chooser = page.waitForEvent('filechooser');
    await yard('.modal.k-menu [data-act="import"]').click();
    const fc = await chooser;
    await page.waitForFunction(() => !document.querySelector('#station-yard').shadowRoot.querySelector('.modal.k-menu [data-before]'), null, { timeout: 15000 });
    await fc.setFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
    await yard('.modal.dialog [data-act="import-confirm"]').click();
    await page.waitForFunction(() => window.__bincov.hideoutRuntime.snapshot().profile.cash === 900);
    return { repainted: true };
  });

  await step('B9-desktop-click-moves-nothing-else', async () => {
    // Maintainer, 2026-10-27: a click changes the part on the gun, its position, the numbers and the bar, nothing else.
    // Every box keeps its place and size, and the gun its scale and place: a new stock leaves the muzzle end where it
    // was, a new muzzle the stock end.
    const boxes = () => bench('.gs').evaluate(g => {
      const b = e => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round).join(','); };
      const all = sel => [...g.querySelectorAll(sel)].map(b).join(' ');
      const img = g.querySelector('.gs-bench-art').getBoundingClientRect();
      return { fixed: { head: b(g.querySelector('.gs-head')), stage: b(g.querySelector('.gs-stage')), frame: b(g.querySelector('.gs-frame')), pos: all('[data-gs="pos"]'),
        rows: all('.gs-srow'), cards: all('.gs-list .gs-card'), guns: all('.gs-left .gs-gun'), foot: b(g.querySelector('.gs-foot')), acts: all('.gs-acts button') },
        left: Math.round(img.left), right: Math.round(img.right), top: Math.round(img.top), scale: img.height / g.querySelector('.gs-bench-art').naturalHeight };
    });
    const res = [];
    for (const size of [[1920, 1080], [1280, 720]]) {
      await open(fixture(), size); await openFromSlot();
      await pos('gun/stock/0').click(); const a = await boxes();
      await part('S01').click(); const b = await boxes();
      assert.deepEqual(b.fixed, a.fixed, `${size} stock`); assert.equal(b.right, a.right, 'a new stock leaves the muzzle end'); assert.equal(b.top, a.top); assert.equal(b.scale, a.scale);
      await pos('gun/handguard/0').click(); const c = await boxes();
      await part('H01').click(); const d = await boxes();
      assert.deepEqual(d.fixed, c.fixed, `${size} railed handguard: the rail positions open in place`); assert.equal(d.left, c.left); assert.equal(d.scale, c.scale);
      await pos('gun/mag/0').click(); const e = await boxes();
      await part('G10').click(); const f = await boxes();
      assert.deepEqual(f.fixed, e.fixed, `${size} magazine`); assert.equal(f.left, e.left); assert.equal(f.right, e.right);
      await fits(); res.push(`${size[0]}×${size[1]} 1:${a.scale}`);
      await bench('[data-gs="cancel"]').click();
    }
    return res.join('、');
  });

  await step('B5-desktop-1920x1080', async () => {
    await open(fixture(), [1920, 1080]); await openFromSlot(); await fits();
    await pos('gun/top/0').click(); await bench('[data-gs="unowned"]').click(); await bench('[data-gs="detail"]').click();
    await part('O08').click();
    await shot('05-desktop-1920x1080');
  });
} finally {
  await context?.close(); await browser.close(); report.finishedAt = new Date().toISOString();
  report.summary = { passed: report.steps.filter(s => s.status === 'passed').length, total: report.steps.length };
  const filterProblems = reportFilter(filter, report.steps.length); if (filterProblems.length) report.summary.filterProblems = filterProblems;
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report.summary));
  if (report.summary.passed !== report.summary.total || report.errors.length || report.external.length) process.exitCode = 1;
}
