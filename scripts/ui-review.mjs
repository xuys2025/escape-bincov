/** Real UI screenshots and geometry checks; fixtures are only used for expanded storage and raid views. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';

const out = resolve('test-results/ui');
await mkdir(out, { recursive: true });
const report = { startedAt: new Date().toISOString(), checks: [], errors: [], externalRequests: [], methodology: 'Offline file HTML, fresh saves, real UI input at both required viewports. Expanded stash, completed quests and raid positions use explicit fixtures. Screenshots are unmodified browser captures; geometry checks do not replace visual review.' };
const browser = await chromium.launch(browserOptions);
report.browser = browser.version();
try {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    const size = `${viewport.width}x${viewport.height}`;
    const context = await browser.newContext({ viewport, offline: true });
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
          const frame = document.querySelector('#frame').getBoundingClientRect();
          return [...document.querySelectorAll('.hideout, .modal, .map-modal, .inventory-modal, .result')].filter(el => {
            const r = el.getBoundingClientRect();
            const bounds = el.matches(".inventory-modal") ? { left: 0, top: 0, right: innerWidth, bottom: innerHeight } : frame;
            return r.left < bounds.left || r.top < bounds.top || r.right > bounds.right + 1 || r.bottom > bounds.bottom + 1;
          }).map(el => el.className);
        });
        assert.deepEqual(escaped, [], `${name}: panel escaped the game frame`);
        report.checks.push({ viewport: size, view: name, status: 'passed' });
        console.log(`PASS ${size} ${name}`);
      };
      await page.goto(pathToFileURL(resolve('dist/index.html')).href + '?test=1&entry=tabs');
      await action('enter').waitFor(); await page.waitForTimeout(200);
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
      await page.waitForFunction(() => window.__bincov.app.raid?.player?.active);
      await page.evaluate(() => {
        const r = window.__bincov.app.raid;
        r.enemies.forEach(e => { e.cooldown = 9999; });
        r.player.setPosition(700, 784);
      });
      // Bleeding must not be described as a normal state when pollution is low.
      const statusLabels = await page.evaluate(() => {
        const r = window.__bincov.app.raid;
        const before = { bleeding: r.bleeding, pollution: r.pollution };
        r.bleeding = 1; r.pollution = 0; r.updateHud();
        const bleeding = document.querySelector('#status').textContent;
        r.pollution = 50; r.updateHud();
        const combined = document.querySelector('#status').textContent;
        Object.assign(r, before); r.updateHud();
        return { bleeding, combined };
      });
      assert.match(statusLabels.bleeding, /流血/);
      assert.doesNotMatch(statusLabels.bleeding, /正常|稳定/);
      assert.match(statusLabels.combined, /流血.*污染 50%/);
      await page.waitForTimeout(300); await shot('raid');
      await page.keyboard.press('Tab'); await shot('inventory');
      await page.locator('[data-source="bag"][aria-label^="密封绷带"]').click(); await shot('inventory-item');
      const bandagesBefore = await page.evaluate(() => {
        const { app } = window.__bincov;
        app.raid.hp = 100; app.raid.bleeding = 0;
        return app.loadout.bag.items.filter(i => i.id === 'bandage').reduce((n, i) => n + i.qty, 0);
      });
      await action('use').click();
      assert.match(await page.locator('#toast').textContent(), /生命已满/,
        'Unnecessary treatment explanation was replaced by a generic transaction error');
      assert.equal(await page.evaluate(() => window.__bincov.app.loadout.bag.items
        .filter(i => i.id === 'bandage').reduce((n, i) => n + i.qty, 0)), bandagesBefore);
      await action('close').click(); await page.keyboard.press('m'); await shot('map');
      await action('close').click(); await page.keyboard.press('Escape'); await shot('pause');
      const timer = await page.locator('#timer').textContent();
      await page.waitForTimeout(200);
      assert.equal(await page.locator('#timer').textContent(), timer, 'Pause changes the displayed clock');
      await action('abandon').click(); await shot('abandon');
      await action('confirm-abandon').click(); await action('return').waitFor(); await shot('result');
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
