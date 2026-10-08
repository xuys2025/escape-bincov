// Village playtest walkthrough with real input only: title -> base -> deploy (empty seed) -> walk with WASD along a
// tile path -> fight with mouse aim and clicks -> search the nearest street crate with E and take items -> Tab
// inventory -> M map -> walk to the north checkpoint and hold E -> settlement -> result screen. ?test=1 is used only to
// READ the published frame for steering; no fixture driver call is made. Screenshots of every step land in the output.
//   BINCOV_PLAYTEST_HTML (default: start the game.html), BINCOV_PLAYTEST_OUT, BINCOV_PLAYTEST_SEED (typed seed, optional),
//   BINCOV_PLAYTEST_SIZE (default 1280x720).
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';

const out = resolve(process.env.BINCOV_PLAYTEST_OUT || 'test-results/coast-playtest'); await mkdir(out, { recursive: true });
const html = resolve(process.env.BINCOV_PLAYTEST_HTML || 'start the game.html');
const [W, H] = (process.env.BINCOV_PLAYTEST_SIZE || '1280x720').split('x').map(Number);
const report = { startedAt: new Date().toISOString(), html, size: [W, H], steps: [], errors: [], requests: [], log: [] };
const browser = await chromium.launch(browserOptions);
const context = await browser.newContext({ viewport: { width: W, height: H }, offline: true });
context.on('request', r => { if (/^https?:/.test(r.url())) report.requests.push(r.url()); });
const page = await context.newPage(); page.setDefaultTimeout(20000);
page.on('pageerror', e => report.errors.push(e.stack ?? e.message));
const wait = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => { const s = a.join(' '); report.log.push(s); console.log(s); };
let shotNo = 0;
const shot = async (name, note) => { const file = `${String(++shotNo).padStart(2, '0')}-${name}.png`; await page.screenshot({ path: resolve(out, file) }); report.steps.push({ shot: file, note, at: await brief() }); };
const brief = () => page.evaluate(() => {
  const h = window.__bincov?.app?.coastSample, b = h?.lastBatch;
  return { state: window.__bincov?.app?.state, panel: h?.panel ?? null, phase: b?.frame.phase ?? null, map: b?.stamp.world.mapId ?? null,
    player: b ? { x: Math.round(b.frame.player.x), y: Math.round(b.frame.player.y), hp: Math.round(b.frame.hud.hp) } : null,
    where: document.querySelector('[data-where]')?.textContent ?? null };
}).catch(() => null);
const S = () => page.evaluate(() => {
  const h = window.__bincov.app.coastSample, b = h?.lastBatch; if (!b) return null;
  const f = b.frame, v = h.view, r = document.querySelector('.coast-sample canvas').getBoundingClientRect();
  return {
    panel: h.panel, phase: f.phase, map: b.stamp.world.mapId, p: { x: f.player.x, y: f.player.y }, hud: f.hud, interaction: f.interaction,
    enemies: f.actors.filter(a => a.alive && v.actorShown(a.uid)).map(a => ({ uid: a.uid, x: a.x, y: a.y, kind: a.kind })),
    crates: f.containers.filter(c => c.kind === 'crate' && c.stacks > 0 && c.regionId === null).map(c => ({ id: c.id, x: c.x, y: c.y })),
    exits: b.map.exits.map(e => ({ id: e.id, x: e.at.x, y: e.at.y })), cells: null,
    screen: { left: r.left, top: r.top, s: v.view.s / v.view.dpr, cx: v.cam.x, cy: v.cam.y },
  };
});
const cells = () => page.evaluate(() => { const b = window.__bincov.app.coastSample.lastBatch, m = b.map; return { cells: m.cells, doors: m.doors.map(d => ({ x: d.x, y: d.y, id: d.id })), open: b.frame.doors }; });
const toScreen = (s, x, y) => ({ x: s.screen.left + (x - s.screen.cx) * s.screen.s, y: s.screen.top + (y - s.screen.cy) * s.screen.s });

// --- navigation: BFS over floor tiles (closed doors and walls blocked), steering with WASD toward tile centres ---
function path(grid, from, to) {
  const { cells: c, doors, open } = grid, rows = c.length, cols = c[0].length;
  const blocked = (x, y) => { if (x < 0 || y < 0 || x >= cols || y >= rows) return true; const d = doors.find(d => d.x === x && d.y === y); if (d) return !open[d.id]; return c[y][x] !== 'floor'; };
  const key = (x, y) => y * cols + x, start = [Math.floor(from.x / 32), Math.floor(from.y / 32)], goal = [Math.floor(to.x / 32), Math.floor(to.y / 32)];
  const prev = new Map([[key(...start), null]]), q = [start];
  while (q.length) {
    const [x, y] = q.shift();
    if (x === goal[0] && y === goal[1]) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy; if (blocked(nx, ny) && !(nx === goal[0] && ny === goal[1]) || prev.has(key(nx, ny))) continue;
      prev.set(key(nx, ny), [x, y]); q.push([nx, ny]);
    }
  }
  if (!prev.has(key(...goal))) return null;
  const route = []; for (let at = goal; at; at = prev.get(key(...at))) route.unshift({ x: at[0] * 32 + 16, y: at[1] * 32 + 16 });
  return route;
}
const held = new Set();
async function keys(want) { for (const k of ['w', 'a', 's', 'd']) { if (want.has(k) && !held.has(k)) { await page.keyboard.down(k); held.add(k); } else if (!want.has(k) && held.has(k)) { await page.keyboard.up(k); held.delete(k); } } }
let shots = 0, kills = 0;
async function fight(s) {
  const near = s.enemies.map(e => ({ ...e, d: Math.hypot(e.x - s.p.x, e.y - s.p.y) })).filter(e => e.d < 300).sort((a, b) => a.d - b.d)[0];
  if (!near) return false;
  await keys(new Set());
  const at = toScreen(s, near.x, near.y - 22); await page.mouse.move(at.x, at.y);
  if (s.hud.weapon.mag === 0 && !s.hud.weapon.reloading) { await page.keyboard.press('r'); return true; }
  if (s.hud.hp < 45 && s.hud.heals > 0) await page.keyboard.press('q');
  await page.mouse.down(); await wait(40); await page.mouse.up(); shots++;
  if (shots === 3) await shot('combat', '真实交火：鼠标瞄准、左键点射');
  await wait(260);
  return true;
}
async function walkTo(target, { stopWhen = () => false, maxMs = 90000, fightOn = true } = {}) {
  const grid = await cells(), t0 = Date.now(); let route = null, i = 0, last = null, still = 0;
  while (Date.now() - t0 < maxMs) {
    const s = await S(); if (!s) return 'gone';
    if (s.phase === 'ending') return 'ending';
    if (await stopWhen(s)) { await keys(new Set()); return 'arrived'; }
    if (fightOn && await fight(s)) { route = null; continue; }
    if (!route) { route = path(grid, s.p, target); i = 0; if (!route) { log('no path to', JSON.stringify(target)); return 'nopath'; } }
    while (i < route.length - 1 && Math.hypot(route[i].x - s.p.x, route[i].y - s.p.y) < 10) i++;
    const wp = route[i], dx = wp.x - s.p.x, dy = wp.y - s.p.y;
    if (Math.hypot(target.x - s.p.x, target.y - s.p.y) < 14) { await keys(new Set()); return 'arrived'; }
    const want = new Set(); if (dx > 4) want.add('d'); if (dx < -4) want.add('a'); if (dy > 4) want.add('s'); if (dy < -4) want.add('w');
    await keys(want);
    const aim = toScreen(s, s.p.x + Math.sign(dx) * 80, s.p.y - 22 + Math.sign(dy) * 80); await page.mouse.move(aim.x, aim.y);
    if (last && Math.hypot(last.x - s.p.x, last.y - s.p.y) < .5) { if (++still > 25) { route = null; still = 0; } } else still = 0;
    last = s.p; await wait(50);
  }
  await keys(new Set()); return 'timeout';
}

try {
  // 1. Title and base through the ordinary menu.
  await page.goto(pathToFileURL(html).href + '?sample=village&test=1'); await wait(1200);
  await shot('title', '标题页');
  await page.locator('[data-action="enter"]').click(); await wait(600);
  if (process.env.BINCOV_PLAYTEST_SEED) await page.locator('#seed').fill(process.env.BINCOV_PLAYTEST_SEED);
  await shot('base', '水产站整备（行动区域默认居民楼）');
  // 2. Deploy with the seed field as the player left it.
  await page.locator('[data-action="deploy"]').click();
  await page.waitForFunction(() => !!window.__bincov?.app?.coastSample?.lastBatch); await wait(1500);
  await shot('spawn', '出击落点');
  let s = await S(); log('spawn', Math.round(s.p.x), Math.round(s.p.y), 'exits', s.exits.map(e => e.id).join(','));
  // 3. Nearest street crate: walk, fight on the way, open with E, take up to three items.
  const crate = s.crates.sort((a, b) => Math.hypot(a.x - s.p.x, a.y - s.p.y) - Math.hypot(b.x - s.p.x, b.y - s.p.y))[0];
  log('crate', crate?.id, crate && Math.round(crate.x), crate && Math.round(crate.y));
  let walked = false;
  const arrived = await walkTo(crate, { stopWhen: async st => { if (!walked && Math.hypot(st.p.x - s.p.x, st.p.y - s.p.y) > 90) { walked = true; await shot('walk', 'WASD 行进中'); } return st.interaction?.kind === 'container' && st.interaction.ref.id === crate.id; } });
  log('crate walk', arrived, 'shots', shots);
  await shot('crate-prompt', '靠近物资箱的交互提示');
  await page.keyboard.press('e'); await page.waitForFunction(() => window.__bincov.app.coastSample.panel === 'loot'); await wait(300);
  await shot('loot-open', '搜刮面板（世界仍运行）');
  for (let n = 0; n < 3; n++) {
    const item = page.locator('[data-grid="container"] [data-uid]').first();
    if (!(await item.count())) break;
    await item.click(); await wait(150);
    if (n === 0) await shot('loot-detail', '选中物品：名称、描述与操作');
    await page.locator('[data-do="inv-quick"]').click(); await wait(250);
  }
  await shot('loot-taken', '拿取后的背包');
  await page.keyboard.press('Escape'); await wait(300);
  // 4. Inventory and map.
  await page.keyboard.press('Tab'); await wait(400); await shot('inventory', 'Tab 随身物资'); await page.keyboard.press('Tab'); await wait(300);
  await page.keyboard.press('m'); await wait(500); await shot('map', 'M 地图'); await page.keyboard.press('m'); await wait(300);
  // 5. North checkpoint: walk, hold E for the full count, settle.
  s = await S(); const exit = s.exits.find(e => e.id === 'north') ?? s.exits[0];
  const reach = await walkTo(exit, { stopWhen: async st => st.interaction?.kind === 'exit' && Math.hypot(st.p.x - exit.x, st.p.y - exit.y) < 30, maxMs: 120000 });
  log('exit walk', reach, 'shots', shots);
  await shot('exit-zone', '撤离点');
  await page.keyboard.down('e'); await wait(1500); await shot('exit-hold', '按住 E 撤离计时'); await wait(2200); await page.keyboard.up('e');
  await page.waitForFunction(() => window.__bincov.app.state === 'result' || window.__bincov.app.coastSample?.panel === 'ending', null, { timeout: 15000 }).catch(() => {});
  if (await page.evaluate(() => window.__bincov.app.coastSample?.panel === 'ending')) await shot('settling', '结算写入');
  await page.waitForFunction(() => window.__bincov.app.state === 'result', null, { timeout: 15000 });
  await wait(600); await shot('result', '结算页');
  report.result = await page.evaluate(() => ({ outcome: window.__bincov.app.result?.outcome, kills: window.__bincov.app.result?.kills ?? null }));
} catch (error) {
  report.failure = String(error?.stack ?? error).slice(0, 1500); log('FAIL', report.failure.split('\n')[0]);
  await page.screenshot({ path: resolve(out, 'failure.png') }).catch(() => {});
} finally {
  report.shots = shots; report.finishedAt = new Date().toISOString();
  await writeFile(resolve(out, 'playtest.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
log(report.failure ? 'playtest FAILED' : `playtest finished: ${report.result?.outcome}`, `errors ${report.errors.length}, external ${report.requests.length}`);
if (report.failure || report.errors.length || report.requests.length) process.exitCode = 1;
