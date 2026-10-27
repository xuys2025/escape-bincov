/**
 * #26 F12 fresh start from the yard menu: production HTML offline, real yard UI (mouse at desktop sizes, touch at
 * the compact size), Runtime, SaveSession and localStorage. The long-played fixture and the peer write use ?test=1.
 */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';

const option = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const htmlPath = option('html', 'dist/index.html'), html = await readFile(htmlPath, 'utf8');
const out = resolve(option('out', 'test-results/station-reset'));
const SESSION = 'escape-bincov.session.v2', COPY = 'escape-bincov.reset-copy.v1', ORIGIN = 'https://reset.test/';
await mkdir(out, { recursive: true });
const browser = await chromium.launch(browserOptions);
const report = { build: htmlPath, sha256: createHash('sha256').update(html).digest('hex'), browser: browser.version(), startedAt: new Date().toISOString(),
  methodology: 'Packaged HTML served offline on one origin. Real yard menu and dialogs (mouse at 1280x720 and 1920x1080, touch emulation at 844x390, not a real device), real Runtime, SaveSession, Web Locks, storage events and downloads. Fixtures (a long-played profile, a peer write, an unreadable record) use ?test=1 hooks or raw localStorage. Date.now is fixed per page so the five-second base checkpoint cannot add writes to the byte comparisons; S3 moves it forward by six seconds while the restore confirmation is open, so one real checkpoint commits before the player confirms.',
  steps: [], errors: [], external: [], screenshots: [] };
let context, page, mobile;
const yard = s => page.locator(`#station-yard ${s}`);
const tap = el => mobile ? el.tap() : el.click();
const read = (p, key) => p.evaluate(k => localStorage.getItem(k), key);
const stored = async p => JSON.parse(await read(p, SESSION));
const writes = p => p.evaluate(() => window.__resetWrites.slice());
const ready = p => p.waitForFunction(() => window.__station?.mounted && window.__station.host.frames > 8);
async function settle() {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const root = document.querySelector('#station-yard')?.shadowRoot;
    await Promise.all((root?.getAnimations() ?? []).filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
  });
}
async function shot(name) { await settle(); await page.screenshot({ path: resolve(out, `${name}.png`) }); report.screenshots.push(`${name}.png`); }
async function step(name, fn) {
  const row = { name, status: 'running' }; report.steps.push(row);
  try { row.detail = await fn(); assert.deepEqual(report.errors, []); assert.deepEqual(report.external, []); row.status = 'passed'; console.log('PASS', name); }
  catch (e) { row.status = 'failed'; row.error = String(e.stack); process.exitCode = 1; await page?.screenshot({ path: resolve(out, `fail-${report.steps.length}.png`) }).catch(() => {}); console.log('FAIL', name, e.message); }
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
}
async function openContext(size) {
  await context?.close(); mobile = size[0] < 900;
  context = await browser.newContext({ offline: true, acceptDownloads: true, viewport: { width: size[0], height: size[1] }, deviceScaleFactor: 1, hasTouch: mobile, isMobile: mobile });
  await context.route(`${ORIGIN}**`, r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
  await context.addInitScript(() => {
    // Fixed clock; window.__advanceClock(ms) moves it forward for a step that needs the yard's base checkpoint.
    const fixed = Date.now(); let offset = 0; Date.now = () => fixed + offset; window.__advanceClock = ms => { offset += ms; };
    window.__resetWrites = [];
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function(k, v) { const r = write.call(this, k, v); window.__resetWrites.push(k); return r; };
  });
  context.on('request', r => { if (/^https?:/.test(r.url()) && !r.url().startsWith(ORIGIN)) report.external.push(r.url()); });
}
async function openPage(query = '?test=1') {
  const p = await context.newPage(); p.setDefaultTimeout(20000);
  p.on('pageerror', e => report.errors.push(String(e.stack)));
  p.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  p.downloads = []; p.on('download', d => p.downloads.push(d));
  await p.goto(`${ORIGIN}${query}`); await p.waitForFunction(() => window.__bincov?.hideoutRuntime);
  return p;
}
/** Long-played profile written through the session transaction while the yard is closed (test hook). */
async function seedRich() {
  await page.evaluate(async () => window.__station.reseed(() => {
    const s = window.__bincov.saveSession, t = s.prepareExpansionMutation(d => {
      Object.assign(d.profile, { cash: 4321, stats: { runs: 9, extracts: 4, kills: 17 } });
      d.profile.quests.repair = true; d.profile.settings.volume = .6;
      d.expansion.base.facilities.rest = 2; d.expansion.growth.permanent.strength = 14; d.expansion.body.hp = 60;
    });
    if (s.commitExpansionMutation(t) !== 'committed') throw Error('fixture did not commit');
  }));
  await ready(page);
}
async function enterYard() { await tap(page.locator('[data-action="enter"]')); await ready(page); }
async function openMenu() {
  const btn = yard('[data-quick="menu"]'); if (!await btn.isVisible()) await tap(yard('[data-quickmenu]'));
  await tap(btn); await yard('.modal.k-menu').waitFor();
}
/** Armed before the click; a step that fails earlier must not leave an unhandled rejection behind. */
function expectDownload() { const pending = page.waitForEvent('download'); pending.catch(() => {}); return pending; }
const toastWith = text => yard('.toast').filter({ hasText: text }).last();
function summary(record) {
  return { cash: record.profile.cash, runs: record.profile.stats.runs, quests: record.profile.quests, volume: record.profile.settings.volume,
    facilities: record.expansion.base.facilities, strength: record.expansion.growth.permanent.strength, revision: record.revision };
}
const freshFacilities = { rest: 0, medical: 0, training: 0, workbench: 0, blackmarket: 0 };

try {
  for (const size of [[1280, 720], [1920, 1080], [844, 390]]) {
    const tag = size.join('x');
    await step(`S1 ${tag} yard menu offers 清空存档，重新开始 and asks for confirmation`, async () => {
      await openContext(size); page = await openPage(); await enterYard(); await seedRich(); await openMenu();
      const reset = yard('.modal.k-menu [data-act="reset"]'); await reset.scrollIntoViewIfNeeded();
      assert.equal((await reset.textContent()).trim(), '清空存档，重新开始'); assert.equal(await reset.isVisible(), true);
      assert.equal(await yard('[data-act="reset-restore"]').count(), 0, 'no restore entry before any reset');
      await shot(`${tag}-menu`);
      const before = await read(page, SESSION); await tap(reset);
      const dialog = yard('.dialog.k-reset'); await dialog.waitFor();
      assert.equal(await dialog.locator('h2').textContent(), '清空存档');
      assert.match(await dialog.textContent(), /除音量设置外，现金、物资、仓库扩容、任务、设施、身体、成长和出击记录都会回到新开局。/);
      assert.match(await dialog.textContent(), /本机只保存一份；当前存档如果还是没动过的新开局，就不另存，原来那一份保留。/, 'the dialog states the pristine exception');
      assert.equal(await dialog.locator('[data-act="reset-confirm"]').textContent(), '下载备份并清空');
      assert.equal(await read(page, SESSION), before, 'opening the dialog writes nothing'); assert.equal(await read(page, COPY), null);
      await shot(`${tag}-confirm`);
      // 再想想 closes without writing; the menu reopens the same dialog.
      await tap(dialog.locator('[data-act="close"]', { hasText: '再想想' })); await yard('.dialog').waitFor({ state: 'hidden' });
      assert.equal(await read(page, SESSION), before); await tap(reset); await dialog.waitFor();
      return { entry: '清空存档，重新开始', dialog: '清空存档', profile: summary(JSON.parse(before)) };
    });
    await step(`S2 ${tag} confirm downloads the old save, wipes to a fresh start in place and keeps a local copy`, async () => {
      const before = await stored(page), writesBefore = (await writes(page)).length, downloaded = expectDownload();
      await tap(yard('.dialog [data-act="reset-confirm"]'));
      const download = await downloaded, text = await readFile(await download.path(), 'utf8'), backup = JSON.parse(text);
      assert.match(download.suggestedFilename(), /^Escape-Bincov-save-.*\.json$/);
      assert.equal(backup.format, 'escape-bincov-recovery-backup'); assert.deepEqual(summary(backup.record), summary(before));
      await toastWith('存档已清空，重新开始。').waitFor();
      const after = await stored(page);
      assert.deepEqual(summary(after), { cash: 700, runs: 0, quests: { repair: false, sample: false, ledger: false }, volume: .6, facilities: freshFacilities, strength: 10, revision: before.revision + 1 });
      assert.equal(after.expansion.body.hp, 100); assert.equal(after.profile.equipment.weapon, 'pistol');
      assert.equal(await read(page, COPY), text, 'the local copy is the downloaded backup');
      assert.deepEqual((await writes(page)).slice(writesBefore), [COPY, SESSION], 'one copy write, then one session commit');
      assert.equal(await page.evaluate(() => window.__station.mounted && document.querySelectorAll('#station-yard').length), 1, 'yard stays mounted');
      assert.equal(await yard('#hud-cash').textContent(), '¥ 700'); assert.match(await yard('#hud-sub').textContent(), /累计出击 0 次 · 应急供电/);
      const restore = yard('.modal.k-menu [data-act="reset-restore"]'); await restore.waitFor();
      assert.equal((await restore.textContent()).trim(), '恢复清空前的存档');
      // Toasts sit over the lower menu entries; the evidence shot waits until they are gone.
      await page.waitForFunction(() => !document.querySelector('#station-yard').shadowRoot.querySelector('.toasts').children.length);
      await restore.scrollIntoViewIfNeeded(); await shot(`${tag}-menu-after-reset`);
      return { download: download.suggestedFilename(), backup: summary(backup.record), stored: summary(after), copyBytes: text.length };
    });
    await step(`S3 ${tag} 恢复清空前的存档 restores through the import confirmation and keeps the copy, also after a base checkpoint`, async () => {
      const copy = await read(page, COPY), before = await stored(page), downloads = page.downloads.length;
      await tap(yard('[data-act="reset-restore"]'));
      const dialog = yard('.dialog.k-import'); await dialog.waitFor();
      assert.match(await dialog.textContent(), /用「清空前的存档」覆盖当前存档？/);
      assert.equal((await stored(page)).revision, before.revision, 'preview writes nothing');
      if (tag === '1280x720') await shot(`${tag}-restore-confirm`);
      // The player reads the dialog for six seconds: the yard keeps ticking and commits one base checkpoint meanwhile.
      await page.evaluate(() => window.__advanceClock(6000));
      await page.waitForFunction(r => JSON.parse(localStorage.getItem('escape-bincov.session.v2')).revision === r + 1, before.revision);
      assert.equal(await dialog.isVisible(), true, 'the confirmation is still open after the checkpoint');
      await page.waitForFunction(() => !document.querySelector('#station-yard').shadowRoot.querySelector('.toasts').children.length);
      await tap(dialog.locator('[data-act="import-confirm"]'));
      const toast = yard('.toast').first(); await toast.waitFor();
      assert.equal(await toast.textContent(), '备份已导入。', 'a checkpoint while the dialog was open must not void the confirmed restore');
      const after = await stored(page);
      assert.deepEqual(summary(after), { cash: 4321, runs: 9, quests: { repair: true, sample: false, ledger: false }, volume: .6, facilities: { ...freshFacilities, rest: 2 }, strength: 14, revision: before.revision + 2 });
      assert.equal(page.downloads.length, downloads, 'a restore downloads nothing');
      assert.equal(await read(page, COPY), copy, 'the copy stays after a restore');
      assert.equal(await yard('#hud-cash').textContent(), '¥ 4,321'); assert.equal(await page.evaluate(() => window.__station.mounted), true);
      return { restored: summary(after) };
    });
  }
  await step('S4 1280x720 a second reset of a still pristine save keeps the pre-reset copy', async () => {
    await openContext([1280, 720]); page = await openPage(); await enterYard(); await seedRich(); await openMenu();
    const resetOnce = async () => {
      const downloaded = expectDownload(), rev = (await stored(page)).revision;
      await tap(yard('.modal.k-menu [data-act="reset"]')); await tap(yard('.dialog [data-act="reset-confirm"]'));
      await downloaded; await page.waitForFunction(r => JSON.parse(localStorage.getItem('escape-bincov.session.v2')).revision === r + 1, rev);
    };
    await resetOnce(); const copy = await read(page, COPY); assert.equal(JSON.parse(copy).record.profile.cash, 4321);
    await toastWith('存档已清空，重新开始。').waitFor();
    const writesBefore = (await writes(page)).length;
    await resetOnce();
    await toastWith('存档已清空。当前存档没动过，本机保留的仍是之前清空前的存档。').waitFor();
    assert.equal(await read(page, COPY), copy, 'resetting an untouched fresh start keeps the real pre-reset copy');
    assert.deepEqual((await writes(page)).slice(writesBefore), [SESSION], 'no copy write');
    assert.equal(page.downloads.length, 2, 'the backup download still happens');
    assert.deepEqual(summary(await stored(page)).facilities, freshFacilities);
    return { copyCash: 4321, downloads: page.downloads.length };
  });
  await step('S5 1280x720 reload shows the title with runs 0 and the copy survives', async () => {
    const copy = await read(page, COPY);
    await page.reload(); await page.waitForFunction(() => window.__bincov?.hideoutRuntime);
    const enter = page.locator('[data-action="enter"]'); await enter.waitFor();
    assert.equal(await enter.locator('small').count(), 0, 'no "已出击 N 次" line for runs 0');
    assert.equal(await page.evaluate(() => window.__bincov.app.save.stats.runs), 0); assert.equal(await read(page, COPY), copy);
    assert.equal(await page.locator('body').evaluate(b => b.innerText.includes('清空存档')), false, 'never offered on the title screen');
    await enterYard(); await openMenu(); await yard('[data-act="reset-restore"]').waitFor();
    return { runs: 0, copyKept: true };
  });
  await step('S6 1280x720 a second tab without the lock cannot reach the reset; a taken-over yard refuses it with raw bytes unchanged', async () => {
    const a = page, b = await openPage();
    assert.equal(await b.evaluate(() => window.__bincov.saveSession.ownsStorage), false);
    await b.getByRole('heading', { name: '暂时无法打开存档' }).waitFor();
    const raw = await read(b, SESSION), copy = await read(b, COPY);
    assert.equal(await b.evaluate(() => window.__bincov.hideoutRuntime.enter().reason), 'conflict');
    assert.equal(await b.locator('#station-yard').count(), 0); assert.equal(await b.locator('body').evaluate(el => el.innerText.includes('清空存档')), false);
    assert.equal(await read(b, SESSION), raw); assert.equal(await read(b, COPY), copy); assert.deepEqual(await writes(b), []);
    // A peer (an old window without lock support) writes the record; the yard page receives the storage event.
    const peer = await b.evaluate(key => { const r = JSON.parse(localStorage.getItem(key)); r.profile.cash += 111; r.revision += 1; const text = JSON.stringify(r); localStorage.setItem(key, text); return text; }, SESSION);
    await a.waitForFunction(() => window.__bincov.app.conflict);
    page = a; const aWrites = (await writes(a)).length, aDownloads = a.downloads.length;
    await tap(yard('.modal.k-menu [data-act="reset"]'));
    const refusalToast = toastWith('存档已由另一窗口接管，本页不能写入。');
    assert.equal(await refusalToast.count(), 0, 'the confirmation must produce new conflict feedback');
    // The toast expires after 3.1 seconds; observe it before the click's protocol reply can be delayed.
    const refused = refusalToast.waitFor(); refused.catch(() => {});
    await tap(yard('.dialog [data-act="reset-confirm"]'));
    await refused; await yard('.dialog.k-storage').waitFor();
    await a.waitForTimeout(500);
    assert.equal(await read(a, SESSION), peer); assert.equal(await read(a, COPY), copy);
    assert.equal((await writes(a)).length, aWrites); assert.equal(a.downloads.length, aDownloads, 'no download for a refused reset');
    await shot('1280x720-refused-conflict');
    await b.close();
    return { secondTab: 'no lock, title storage modal, enter refused', takenOver: 'conflict toast, storage dialog, bytes unchanged' };
  });
  await step('S7 never offered on the legacy tab page or for an unreadable save', async () => {
    await openContext([1280, 720]); page = await openPage('?test=1&entry=tabs');
    await page.locator('[data-action="enter"]').click(); await page.locator('#ui .panel.hideout').waitFor();
    assert.equal(await page.locator('#ui').evaluate(el => el.innerText.includes('清空存档')), false, 'legacy tab page');
    // A record from a newer build (one version past this one): the strict decoder refuses it and the title keeps the raw bytes.
    const record = await stored(page); record.version += 1; const future = JSON.stringify(record);
    await page.evaluate(([key, text]) => localStorage.setItem(key, text), [SESSION, future]);
    await page.goto(`${ORIGIN}?test=1`); await page.waitForFunction(() => window.__bincov?.hideoutRuntime);
    await page.getByRole('heading', { name: '暂时无法打开存档' }).waitFor();
    assert.match(await page.evaluate(() => window.__bincov.app.storageError), /无法读取这份存档/);
    assert.equal(await page.evaluate(() => window.__bincov.hideoutRuntime.enter().ok), false);
    assert.equal(await page.locator('#station-yard').count(), 0); assert.equal(await page.locator('body').evaluate(el => el.innerText.includes('清空存档')), false);
    assert.equal(await read(page, SESSION), future, 'unreadable bytes are kept'); assert.equal(await read(page, COPY), null);
    return { legacyTabs: 'no entry', unreadable: 'storage modal only, bytes kept' };
  });
  await step('S8 1280x720 resetting an untouched new game makes no local copy and says so', async () => {
    await openContext([1280, 720]); page = await openPage(); await enterYard(); await openMenu();
    assert.equal(await yard('[data-act="reset-restore"]').count(), 0);
    const before = await stored(page), writesBefore = (await writes(page)).length, downloaded = expectDownload();
    await tap(yard('.modal.k-menu [data-act="reset"]')); await tap(yard('.dialog [data-act="reset-confirm"]'));
    await downloaded; await toastWith('存档已清空。当前存档没动过，本机没有另存。').waitFor();
    assert.equal((await stored(page)).revision, before.revision + 1, 'the reset itself still commits');
    assert.equal(await read(page, COPY), null, 'a pristine save is not copied');
    assert.deepEqual((await writes(page)).slice(writesBefore), [SESSION], 'no copy write');
    assert.equal(await yard('[data-act="reset-restore"]').count(), 0, 'no restore entry without a copy');
    return { copy: null, downloads: page.downloads.length };
  });
} finally { await context?.close(); await browser.close(); report.finishedAt = new Date().toISOString(); await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2)); }
