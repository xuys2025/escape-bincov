/** Real UI screenshots and geometry checks; fixtures are only used for expanded storage and raid views. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import { batch, drive, frames, raidReady, stand, waitPanel } from './raid-view.mjs';
import { openPause, resumeStalls, running } from './stall-resume.mjs';

const out = resolve('test-results/ui');
await mkdir(out, { recursive: true });
const report = { startedAt: new Date().toISOString(), checks: [], errors: [], externalRequests: [], methodology: 'Offline file HTML, fresh saves, real UI input at both required viewports. Expanded stash, completed quests and raid positions use explicit fixtures. Screenshots are unmodified browser captures; geometry checks do not replace visual review.' };
const browser = await chromium.launch(browserOptions);
report.browser = browser.version();
try {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    const size = `${viewport.width}x${viewport.height}`;
    const context = await browser.newContext({ viewport, offline: true });
    await resumeStalls(context);
    try {
      context.on('request', r => { if (/^https?:/.test(r.url())) report.externalRequests.push(r.url()); });
      const page = await context.newPage();
      page.on('pageerror', error => report.errors.push(error.message));
      page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
      const action = (name, id) => page.locator(`[data-action="${name}"]${id ? `[data-id="${id}"]` : ''}`);
      const shot = async name => {
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: resolve(out, `${size}-${name}.png`) });
        const escaped = await page.evaluate(() => {
          const frame = document.querySelector('#frame').getBoundingClientRect(), view = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
          // The raid's panels belong to the full-window raid view, the page's own panels to the game frame.
          return [...document.querySelectorAll('.hideout, .modal, .result, .coast-sample [data-panel]:not([hidden])')].filter(el => {
            const r = el.getBoundingClientRect();
            const bounds = el.closest('.coast-sample') ? view : frame;
            return r.left < bounds.left || r.top < bounds.top || r.right > bounds.right + 1 || r.bottom > bounds.bottom + 1;
          }).map(el => el.className);
        });
        assert.deepEqual(escaped, [], `${name}: panel escaped the game frame`);
        report.checks.push({ viewport: size, view: name, status: 'passed' });
        console.log(`PASS ${size} ${name}`);
      };
      await page.goto(pathToFileURL(resolve('dist/index.html')).href + '?test=1&entry=tabs');
      await action('enter').waitFor({ timeout: 60000 }); await page.waitForTimeout(200);
      await shot('menu');
      await action('help').click(); await shot('help'); await action('close').click();
      await action('enter').click(); await shot('gear');
      // Inventory names and stack counts must never share the same painted area.
      assert.deepEqual(await page.locator('.item:has(.qty)').evaluateAll(items => items.filter(item => {
        const label = item.querySelector('.item-label').getBoundingClientRect();
        const qty = item.querySelector('.qty').getBoundingClientRect();
        return label.left < qty.right && label.right > qty.left && label.top < qty.bottom && label.bottom > qty.top;
      }).map(item => item.getAttribute('aria-label'))), [], 'Inventory quantities cover names');
      const bandage = page.locator('[data-source="bag"][aria-label^="密封绷带"]');
      await bandage.focus(); await page.keyboard.press('Enter');
      assert.equal(await bandage.getAttribute('aria-pressed'), 'true');
      assert.equal(await bandage.evaluate(el => el === document.activeElement), true, 'Selection loses keyboard focus');
      await shot('item');
      for (const tab of ['arms', 'med', 'quests', 'home']) { await action('tab', tab).click(); await shot(tab); }
      // All hideout tabs must keep their working area above the departure controls.
      for (const tab of ['gear', 'arms', 'med', 'quests', 'home']) {
        await action('tab', tab).click();
        assert.equal(await page.evaluate(() => {
          const content = document.querySelector('.content'), footer = document.querySelector('.bottom-bar');
          return content.scrollWidth <= content.clientWidth && content.getBoundingClientRect().bottom <= footer.getBoundingClientRect().top + 1;
        }), true, `${tab}: content overlaps the footer or clips horizontally`);
      }
      // The new task progress must include safe-box supplies and become completed after real submission.
      await page.evaluate(() => window.__bincov.app.save.safe.items.push({ id: 'sample', qty: 1, uid: 'ui-task-sample', x: 0, y: 0 }));
      await action('tab', 'quests').click();
      const sampleQuest = page.locator('.quest').filter({ has: page.getByRole('heading', { name: '瓶中的潮声' }) });
      assert.equal(await sampleQuest.locator('.quest-status').textContent(), '02可以交付');
      await shot('ready-quest');
      await action('quest', 'sample').click();
      assert.equal(await sampleQuest.locator('.quest-status').textContent(), '02已交付');
      assert.equal(await page.evaluate(() => window.__bincov.app.save.safe.items.length), 0);
      await page.evaluate(() => {
        const { app } = window.__bincov;
        app.save.upgraded = true; app.save.stash.h = 9;
        app.save.stash.items.push({ id: 'watch', qty: 1, uid: 'ui-bottom-row', x: 9, y: 8 });
        app.save.quests = { repair: true, sample: true, ledger: true };
      });
      await action('tab', 'gear').click();
      await page.locator('.content').evaluate(el => { el.scrollTop = el.scrollHeight; });
      await page.locator('[data-uid="ui-bottom-row"]').click();
      assert.equal(await page.locator('[data-uid="ui-bottom-row"]').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.evaluate(() => document.querySelector('[data-uid="ui-bottom-row"]').getBoundingClientRect().bottom < document.querySelector('.bottom-bar').getBoundingClientRect().top), true, 'Last stash row is obstructed');
      await shot('expanded-stash');
      await action('tab', 'quests').click(); await shot('completed-quests');
      await action('tab', 'home').click(); await shot('upgraded-home');
      await action('tab', 'gear').click(); await page.locator('#seed').fill('42'); await action('deploy').click();
      // Every raid runs on the 2.5D host: its own HUD, panels and fixtures (window.__bincovSample).
      await raidReady(page);
      await stand(page, { x: 700, y: 784 });
      // Bleeding must not be described as a normal state when pollution is low. The status line refreshes every 8 frames.
      const status = () => page.locator('.coast-sample [data-state]').textContent();
      const before = (await batch(page)).frame.hud;
      await drive(page, 'vitals', { bleeding: true, pollution: 0 }); await frames(page, 10);
      const bleeding = await status();
      await drive(page, 'vitals', { pollution: 50 });
      // The line shows the Runtime's own value: pollution recovers 0.2 %/s while dry, and ten frames are seconds of raid
      // time on a slow runner. Read it on a frame where the line and the published value agree (it refreshes every 8).
      const combined = await (await page.waitForFunction(() => {
        const t = document.querySelector('.coast-sample [data-state]').textContent, p = window.__bincovSample.host.lastBatch.frame.hud.pollution;
        return p > 45 && t.includes(`污染 ${Math.round(p)}%`) ? t : false;
      }, null, { timeout: 20000 })).jsonValue();
      await drive(page, 'vitals', { bleeding: before.bleeding, pollution: before.pollution, hp: before.maxHp }); await frames(page, 10);
      assert.match(bleeding, /流血/);
      assert.doesNotMatch(bleeding, /正常|稳定/);
      assert.match(combined, /流血.*污染 (4[6-9]|50)%/);
      // The camera eases onto the placed player and every rebuild fades in from black (0.45 s).
      await page.waitForTimeout(1500); await shot('raid');
      // Tab opens the bag only while the raid runs (a stall pause resumed after the deploy would swallow it).
      await running(page);
      await page.keyboard.press('Tab'); await waitPanel(page, 'inventory'); await shot('inventory');
      const raidBandage = page.locator('.coast-sample [data-panel] [data-source="bag"][aria-label^="密封绷带"]');
      await raidBandage.click(); await page.locator('.coast-sample [data-do="inv-use"]').waitFor(); await shot('inventory-item');
      const bandages = () => page.evaluate(() => window.__bincov.app.loadout.bag.items.filter(i => i.id === 'bandage').reduce((n, i) => n + i.qty, 0));
      const max = (await batch(page)).frame.hud.maxHp;
      await drive(page, 'vitals', { hp: max, bleeding: false }); await frames(page, 3);
      const bandagesBefore = await bandages();
      await page.locator('.coast-sample [data-do="inv-use"]').click();
      // The panel's own notice is replaced by the host's once the Runtime's rejection is published.
      await page.waitForFunction(() => window.__bincovSample.host.eventLog.some(e => e.type === 'rejected' && e.detail.action === 'use-item')); await frames(page, 2);
      const toast = await page.locator('.coast-sample [data-toast]').innerText();
      assert.match(toast, /生命已满/);
      assert.equal(await bandages(), bandagesBefore, 'Unnecessary treatment consumed a bandage');
      await page.locator('.coast-sample [data-panel] [data-do="close"]').click(); await waitPanel(page, null);
      await running(page);
      await page.keyboard.press('m'); await waitPanel(page, 'map'); await page.locator('.coast-sample [data-map]').waitFor(); await frames(page, 3); await shot('map');
      await page.locator('.coast-sample [data-panel] [data-do="close"]').click(); await waitPanel(page, null);
      await openPause(page); await shot('pause');
      const timer = await page.locator('.coast-sample [data-time]').textContent();
      await frames(page, 4);
      assert.equal(await page.locator('.coast-sample [data-time]').textContent(), timer, 'Pause changes the displayed clock');
      await page.locator('.coast-sample [data-do="abandon"]').click(); await page.locator('.coast-sample [data-do="abandon-yes"]').waitFor(); await shot('abandon');
      await page.locator('.coast-sample [data-do="abandon-yes"]').click(); await action('return').waitFor({ timeout: 30000 }); await shot('result');
    } finally { await context.close(); }
  }
  assert.deepEqual(report.errors, []); assert.deepEqual(report.externalRequests, []);
  report.status = 'passed';
} catch (error) { report.status = 'failed'; report.failure = error.stack; process.exitCode = 1; console.error(error); }
finally {
  report.finishedAt = new Date().toISOString();
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
