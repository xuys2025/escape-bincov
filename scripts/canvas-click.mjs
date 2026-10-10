// Native pointer input must reach the game canvas. A viewport coordinate can
// instead be occupied by HUD buttons, even when the enemy is logically visible.
export async function clickUncoveredCanvas(page, x, y, options = {}) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const clear = await page.evaluate(([x, y]) => {
    const hit = document.elementFromPoint(x, y);
    return hit instanceof HTMLCanvasElement;
  }, [x, y]);
  if (!clear) return false;
  await page.mouse.click(x, y, options);
  return true;
}
