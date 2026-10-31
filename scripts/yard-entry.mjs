/**
 * The ordinary entry (no ?test=1) opens the station yard. Suites that check ordinary play continue the way a player
 * does: the yard's departure panel, or its 页签 button back to the old tab page. With ?test=1&entry=tabs the old tab
 * page is the entry and these helpers are not needed.
 */
import assert from 'node:assert/strict';

/**
 * A raid settled from the yard entry shows one report (#163): after the outro the yard walks in through the gate and
 * opens it, with no result page or tab page on the way. Call watchOldPage before the raid ends; yardReport waits for
 * the report, checks that neither old page was drawn meanwhile and returns the report's text.
 */
export function watchOldPage(page) {
  return page.evaluate(() => {
    const seen = window.__oldPage = { result: 0, tabs: 0 };
    new MutationObserver(() => { if (document.querySelector('#ui .panel.result')) seen.result++; if (document.querySelector('#ui .panel.hideout')) seen.tabs++; })
      .observe(document.getElementById('ui'), { childList: true, subtree: true });
  });
}
export async function yardReport(page, { timeout = 30000 } = {}) {
  const report = page.locator('#station-yard .report');
  await report.waitFor({ timeout });
  assert.deepEqual(await page.evaluate(() => window.__oldPage ?? null), { result: 0, tabs: 0 }, 'the yard report is the only report: no result page or tab page on the way');
  return report.innerText();
}
/**
 * The yard takes the shared Pixi application as soon as the raid view has parked it, so the parked state between the
 * two hosts is read at that moment: `probe(arg)` runs in the page once, when the raid's `.coast-sample` root leaves
 * the body (the view parks the application before removing its root); releasedState waits for what it returned.
 * Checks that need a garbage collection run after the yard is up instead: the raid's objects must stay collectable.
 */
export function atRaidRelease(page, probe, arg = null) {
  return page.evaluate(([source, arg]) => {
    window.__atRaidRelease = undefined;
    const watch = new MutationObserver(() => {
      if (document.querySelector('.coast-sample')) return;
      watch.disconnect();
      try { window.__atRaidRelease = { value: (0, eval)(`(${source})`)(arg) }; } catch (error) { window.__atRaidRelease = { error: String(error?.stack ?? error) }; }
    });
    watch.observe(document.body, { childList: true });
  }, [probe.toString(), arg]);
}
export async function releasedState(page, timeout = 30000) {
  await page.waitForFunction(() => window.__atRaidRelease !== undefined, null, { timeout });
  const r = await page.evaluate(() => window.__atRaidRelease);
  if (r.error) throw new Error(`raid-release probe: ${r.error}`);
  return r.value;
}
/**
 * A new save's first ordinary entry plays the opening cutscene before the yard (docs/OPENING-CUTSCENE-PLAN.md
 * section 3). Skip it with Esc, as a player can; returns at once when the yard or the tab page came up instead.
 */
export async function skipOpening(page) {
  const first = await page.waitForFunction(() => document.getElementById('opening') ? 'opening'
    : document.getElementById('station-yard') || document.querySelector('#ui .panel.hideout') ? 'entered' : false, null, { timeout: 30000 });
  if (await first.jsonValue() !== 'opening') return;
  await page.keyboard.press('Escape');
  await page.locator('#opening').waitFor({ state: 'detached' });
}
/** From the yard to the old tab page (the shortcut fallback entry). */
export async function throughYard(page, { tap = false } = {}) {
  await skipOpening(page);
  const tabs = page.locator('#station-yard [data-tabs]'), more = page.locator('#station-yard [data-quickmenu]');
  await tabs.waitFor({ state: 'attached', timeout: 30000 });
  // Narrow screens fold the shortcut bar into “功能”: open it first, as a player would.
  if (!await tabs.isVisible()) { await more.waitFor({ state: 'visible' }); if (tap) await more.tap(); else await more.click(); }
  await tabs.waitFor({ state: 'visible' });
  if (tap) await tabs.tap(); else await tabs.click();
  await page.locator('#ui .panel.hideout').waitFor({ timeout: 15000 });
}
/** Deploy from the yard's departure panel (7): pick the area, type the seed, open the gate. */
export async function deployFromYard(page, { world, seed } = {}) {
  await skipOpening(page);
  const go = page.locator('#station-yard [data-quick="deploy"]');
  await go.waitFor({ state: 'attached', timeout: 30000 });
  if (!await go.isVisible()) await page.locator('#station-yard [data-quickmenu]').click();
  await go.click();
  if (world) await page.locator(`#station-yard label.world:has(input[value="${world}"])`).click();
  if (seed !== undefined) await page.locator('#station-yard #seed').fill(String(seed));
  await page.locator('#station-yard [data-act="deploy"]').click();
}
