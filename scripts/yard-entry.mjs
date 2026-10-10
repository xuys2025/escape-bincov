/**
 * The ordinary entry (no ?test=1) opens the station yard. Suites that check ordinary play continue the way a player
 * does: the yard's departure panel, or its 页签 button back to the old tab page. With ?test=1&entry=tabs the old tab
 * page is the entry and these helpers are not needed.
 */
/** From the yard to the old tab page (the shortcut fallback entry). */
export async function throughYard(page, { tap = false } = {}) {
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
  const go = page.locator('#station-yard [data-quick="deploy"]');
  await go.waitFor({ state: 'attached', timeout: 30000 });
  if (!await go.isVisible()) await page.locator('#station-yard [data-quickmenu]').click();
  await go.click();
  if (world) await page.locator(`#station-yard label.world:has(input[value="${world}"])`).click();
  if (seed !== undefined) await page.locator('#station-yard #seed').fill(String(seed));
  await page.locator('#station-yard [data-act="deploy"]').click();
}
