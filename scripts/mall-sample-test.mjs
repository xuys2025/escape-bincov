// Mall sample (?sample=mall) on the real mall Runtime: the 2.5D view of layout revision 4 with Sol's samples and the painted
// layout-4 furniture (issue #47). Deploys through the ordinary tab page and the station yard, then checks the layout-4 world, the dressed scene, the
// cutaway from outside, overlap-safe visibility, the stairs between floors, exits per floor, weather, remounts, the
// placeholder fallback and screenshots at 1280x720 and 1920x1080. Fixtures use the explicit ?test=1 driver only to
// place the player and enemies.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { deployFromYard } from './yard-entry.mjs';
import { browserOptions } from './browser-options.mjs';

const out = resolve(process.env.BINCOV_SAMPLE_OUT || 'test-results/mall-sample'); await mkdir(out, { recursive: true });
const htmlPath = resolve(process.env.BINCOV_SAMPLE_HTML || 'dist/index.html'), url = pathToFileURL(htmlPath).href;
const report = { startedAt: new Date().toISOString(), build: url, buildSHA256: createHash('sha256').update(await readFile(htmlPath)).digest('hex'), seed: '42', steps: [], errors: [], requests: [] };
const browser = await chromium.launch(browserOptions); report.browser = browser.version();
const wait = ms => new Promise(r => setTimeout(r, ms));
async function step(name, task) {
  const entry = { name, status: 'running' }; report.steps.push(entry);
  try { entry.detail = await task(); assert.deepEqual(report.errors, []); assert.deepEqual(report.requests, []); entry.status = 'passed'; }
  catch (error) { entry.status = 'failed'; entry.error = String(error?.stack ?? error).slice(0, 1200); }
  console.log(`${entry.status === 'passed' ? 'PASS' : 'FAIL'}  ${name}${entry.error ? `\n      ${entry.error.split('\n')[0]}` : ''}`);
}
async function open(query, viewport = { width: 1280, height: 720 }) {
  const context = await browser.newContext({ viewport, offline: true });
  context.on('request', r => { if (/^https?:/.test(r.url())) report.requests.push(r.url()); });
  const page = await context.newPage(); page.setDefaultTimeout(30000);
  page.on('pageerror', e => report.errors.push(e.stack ?? e.message));
  await page.goto(url + query);
  return { context, page };
}
const action = (page, name) => page.locator(`[data-action="${name}"]`);
const frames = (page, n = 3) => page.evaluate(n => new Promise(r => { let i = 0; const f = () => ++i >= n ? r() : requestAnimationFrame(f); requestAnimationFrame(f); }), n);
const now = page => page.evaluate(() => {
  const h = window.__bincovSample.host, b = h.lastBatch;
  return { map: b.stamp.world.mapId, worldVersion: b.stamp.world.worldVersion, player: b.frame.player, interaction: b.frame.interaction, revealed: b.frame.revealed, panel: h.panel };
});
/** Place the player on the nearest cell to (x, y) (cells) where the body fits. */
const place = (page, x, y, angle = 0, map) => page.evaluate(([x, y, a, m]) => {
  let last = '';
  for (let d = 0; d < 6; d++) for (const [dx, dy] of [[0, 0], [d, 0], [-d, 0], [0, d], [0, -d], [d, d], [-d, -d], [d, -d], [-d, d]]) {
    try { window.__bincovSample.driver.placePlayer({ x: (x + dx) * 32, y: (y + dy) * 32 }, a, m); return { x: x + dx, y: y + dy }; } catch (e) { last = String(e); }
  }
  throw new Error(last);
}, [x, y, angle, map]);
const shot = (page, name) => page.screenshot({ path: resolve(out, name) });
async function deployTabs(page) {
  await action(page, 'enter').click();
  assert.equal(await page.locator('#run-world').inputValue(), 'mall', 'the mall sample preselects the mall');
  await page.locator('#seed').fill('42'); await action(page, 'deploy').click();
  await page.waitForFunction(() => !!window.__bincovSample?.host?.lastBatch, null, { timeout: 60000 });
  await page.evaluate(() => window.__bincovSample.driver.freezeAI(true));
  await frames(page, 5);
}

{
  const { context, page } = await open('?test=1&entry=tabs&sample=mall');
  await step('M00 the mall sample deploys layout revision 4 on the Pixi host with both art sets', async () => {
    await deployTabs(page);
    const spawn = await page.evaluate(() => { const p = window.__bincovSample.host.lastBatch.frame.player; return [p.x, p.y]; });
    assert.deepEqual(spawn, [48.5 * 32, 3.5 * 32], 'layout 4 (like layouts 2 and 3) starts on the entrance plaza');
    const s = await page.evaluate(() => {
      const h = window.__bincovSample.host, c = window.__bincovSample.counts();
      return { state: window.__bincov.app.state, worldVersion: h.session.expansion.raid.worldVersion, map: h.lastBatch.stamp.world.mapId,
        art: c.art, mallArt: c.mallArt, occluders: h.view.stats.occluders, flights: [...h.view.mall.flights], roots: c.sampleRoots };
    });
    assert.equal(s.state, 'run'); assert.equal(s.worldVersion, 'mall-v4'); assert.equal(s.map, 'mall-f1');
    assert.equal(s.art, 'sol'); assert.equal(s.mallArt, 'sol'); assert.equal(s.roots, 1);
    assert.ok(s.occluders > 800, `dressed walls and furniture: ${s.occluders}`);
    assert.deepEqual(s.flights, ['S-N-up'], 'the S-N flight replaces its generic stair marker; other stairs keep theirs');
    return s;
  });
  await step('M01 dressed route: furniture, signs and glows are placed; a fading piece takes its links along', async () => {
    await place(page, 35.5, 23.6, 0, 'mall-f1'); await frames(page, 20);
    const s = await page.evaluate(() => {
      const v = window.__bincovSample.host.view, props = v.occluders.filter(o => o.kind === 'prop');
      const linked = props.filter(o => o.links?.length), glows = v.occluders.flatMap(o => o.links ?? []).filter(l => l.emit);
      // The gondola segment in front of the player fades, and its aisle sign or glow (if any) shares the level.
      const faded = props.filter(o => o.level > 0 && o.sprite.renderable);
      return { props: props.length, linked: linked.length, glows: glows.length, faded: faded.length, gondolas: props.filter(o => o.key.includes('gondola')).length,
        linkVisible: linked.every(o => o.links.every(l => l.sprite.visible === o.sprite.visible)) };
    });
    assert.ok(s.props >= 80 && s.gondolas >= 40, JSON.stringify(s)); assert.ok(s.linked >= 9 && s.glows >= 8, JSON.stringify(s));
    assert.ok(s.faded >= 1, 'the shelf in front of the player fades'); assert.ok(s.linkVisible);
    await shot(page, 'm01-f1-supermarket-1280.png');
    return s;
  });
  await step('M02 the facade stays solid from the plaza and from inside; only the player\'s room is cut away, keeping each wall\'s blocked cell solid', async () => {
    const facade = () => page.evaluate(() => {
      const v = window.__bincovSample.host.view, curtain = v.occluders.filter(o => o.kind === 'wall' && o.key.includes('curtain'));
      return { curtain: curtain.length, levels: [...new Set(curtain.map(o => o.level))], mist: v.weather.shelter };
    });
    await place(page, 59.5, 4.5, Math.PI / 2, 'mall-f1'); await wait(1500); await frames(page, 10);
    const outside = await facade(); await shot(page, 'm02-f1-entrance-outside-1280.png');
    // A walled room (the convenience store F1-06): its own walls are cut, the facade beside it is not.
    await place(page, 60, 21.5, Math.PI / 2, 'mall-f1'); await wait(1500); await frames(page, 10);
    const lobby = await page.evaluate(() => {
      const v = window.__bincovSample.host.view, m = v.mapDef, rooms = [...v.cutRooms];
      const cell = o => ({ x: Math.floor(o.rect.x / 32), y: Math.floor((o.z - 16) / 32) });
      const band = c => c.x >= 8 && c.x <= 64 && c.y >= 6 && c.y <= 48 && (c.x <= 9 || c.x >= 63 || c.y <= 7 || c.y >= 47);
      const cut = v.occluders.filter(o => o.kind === 'wall' && o.level === 3), rects = m.regions.filter(r => rooms.includes(r.id));
      const inRoom = o => rects.some(r => o.rect.x + 16 >= r.x && o.rect.x + 16 < r.x + r.w && o.z - 16 >= r.y && o.z - 16 < r.y + r.h + 32);
      return { rooms, cut: cut.length, outside: cut.filter(o => !inRoom(o)).length, facade: cut.filter(o => band(cell(o))).length,
        keep: [...new Set(cut.map(o => o.keepBottom))], mist: v.weather.shelter };
    });
    await shot(page, 'm02-f1-store-cutaway-1280.png');
    // Only the player's own focus fade (levels 1-2 next to the body) may touch it; the structural cutaway (3) must not.
    assert.ok(outside.curtain >= 6, 'glass curtain cells'); assert.ok(outside.levels.every(l => l < 3) && outside.levels.includes(0), `curtain wall solid from outside: ${outside.levels}`);
    assert.ok(outside.mist < .2, `mist outdoors: ${outside.mist}`);
    assert.deepEqual(lobby.rooms, ['F1-06'], JSON.stringify(lobby)); assert.ok(lobby.cut > 0, 'the store\'s own walls are cut away');
    assert.equal(lobby.outside, 0, 'nothing outside the player\'s room is cut'); assert.equal(lobby.facade, 0, 'the facade is never cut');
    assert.deepEqual(lobby.keep, [32], 'a cut wall keeps its blocked cell solid'); assert.ok(lobby.mist > .8, `mist thins indoors: ${lobby.mist}`);
    return { outside, lobby };
  });
  await step('M03 overlapping rooms fail closed: an enemy in an unrevealed room inside a revealed one stays hidden', async () => {
    // Find two overlapping inside regions on F2 and a fitting point inside both whose inner room is not revealed.
    await place(page, 61.5, 14.6, Math.PI / 2, 'mall-f2'); await frames(page, 10);
    const pair = await page.evaluate(() => {
      const m = window.__bincovSample.host.view.mapDef, R = m.regions.filter(r => r.inside);
      const hit = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
      for (const a of R) for (const b of R) {
        if (a === b || !(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h)) continue;
        const both = [], onlyA = [];
        for (let y = 0; y < m.rows; y++) for (let x = 0; x < m.cols; x++) {
          if (m.cells[y][x] !== 'floor') continue; const px = x * 32 + 16, py = y * 32 + 16;
          if (hit(a, px, py) && hit(b, px, py)) both.push([x + .5, y + .5]); else if (hit(a, px, py) && !hit(b, px, py)) onlyA.push([x + .5, y + .5]);
        }
        if (both.length && onlyA.length) return { a: a.id, b: b.id, both, onlyA };
      }
      return null;
    });
    assert.ok(pair, 'F2 has overlapping rooms');
    let probe = null;
    for (const [x, y] of pair.onlyA.slice(0, 40)) {
      try { await place(page, x, y, 0, 'mall-f2'); } catch { continue; }
      await frames(page, 4); const f = await now(page);
      if (f.revealed[pair.a] && !f.revealed[pair.b]) { probe = { player: [x, y] }; break; }
    }
    if (!probe) { for (const [x, y] of pair.onlyA.slice(0, 40)) { try { await place(page, x, y, 0, 'mall-f2'); } catch { continue; } await frames(page, 4); const f = await now(page); if (f.revealed[pair.b] && !f.revealed[pair.a]) { probe = { player: [x, y], swapped: true }; break; } } }
    assert.ok(probe, `a spot with exactly one of ${pair.a} / ${pair.b} revealed`);
    const r = await page.evaluate(([both]) => {
      const h = window.__bincovSample.host, v = h.view, f = h.lastBatch.frame, d = window.__bincovSample.driver;
      const enemy = f.actors.find(a => a.alive); if (!enemy) return { error: 'no enemy on F2' };
      for (const [x, y] of both) { try { d.placeEnemy(enemy.uid, { x: x * 32, y: y * 32 }); return { uid: enemy.uid, at: [x, y] }; } catch {} }
      return { error: 'no fitting point in the overlap' };
    }, [pair.both]);
    assert.ok(!r.error, r.error); await frames(page, 6);
    const seen = await page.evaluate(([uid, at]) => {
      const h = window.__bincovSample.host, v = h.view, f = h.lastBatch.frame, a = f.actors.find(x => x.uid === uid), p = { x: at[0] * 32, y: at[1] * 32 };
      return { runtimeRegion: a.regionId, revealed: f.revealed[a.regionId] === true, shown: v.actorShown(uid), viewRegion: v.regionAt(p), shownAt: v.shownAt(p, f.revealed) };
    }, [r.uid, r.at]);
    assert.equal(seen.revealed, false); assert.equal(seen.shown, false); assert.equal(seen.shownAt, false); assert.equal(seen.viewRegion, seen.runtimeRegion);
    // Positive control: standing next to it reveals the inner room, and the enemy shows.
    await place(page, r.at[0], r.at[1] + 1, 0, 'mall-f2').catch(() => place(page, r.at[0] + 1, r.at[1], 0, 'mall-f2')); await frames(page, 8);
    const control = await page.evaluate(uid => { const h = window.__bincovSample.host; return { shown: h.view.actorShown(uid), revealed: Object.entries(h.lastBatch.frame.revealed).filter(([, v]) => v).map(([k]) => k) }; }, r.uid);
    return { pair: { a: pair.a, b: pair.b }, probe, enemy: r, seen, control };
  });
  await step('M03b at a room\'s edge a hidden target gives no hit marker, and its corpse\'s blood stays hidden past the edge', async () => {
    // An unrevealed room on F1 whose last column borders open floor in no room; the player waits on the plaza.
    await place(page, 59.5, 4.5, Math.PI / 2, 'mall-f1'); await frames(page, 8);
    const spot = await page.evaluate(() => {
      const h = window.__bincovSample.host, m = h.view.mapDef, f = h.lastBatch.frame, inRoom = (x, y) => m.regions.some(r => r.inside && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
      for (const r of m.regions) {
        if (!r.inside || f.revealed[r.id]) continue;
        const cx = (r.x + r.w) / 32 - 1;
        for (let cy = r.y / 32 + 1; cy < (r.y + r.h) / 32 - 1; cy++) {
          const p = { x: r.x + r.w - 6, y: cy * 32 + 16 };
          if (m.cells[cy][cx] === 'floor' && m.cells[cy][cx + 1] === 'floor' && m.cells[cy - 1][cx + 1] === 'floor' && m.cells[cy + 1][cx + 1] === 'floor' && !inRoom(p.x + 16, p.y)) return { room: r.id, p };
        }
      }
      return null;
    });
    assert.ok(spot, 'a room edge next to open floor in no room');
    const enemy = await page.evaluate(([p]) => {
      const h = window.__bincovSample.host, d = window.__bincovSample.driver, a = h.lastBatch.frame.actors.find(x => x.alive);
      try { d.placeEnemy(a.uid, p); return a.uid; } catch (e) { return 'error: ' + e; }
    }, [spot.p]);
    assert.ok(!enemy.startsWith('error'), enemy); await frames(page, 6);
    // A player bullet meets the target's circle just outside the room: no marker for a target the Runtime hides.
    const marker = await page.evaluate(([uid, p]) => {
      const h = window.__bincovSample.host, contact = { x: p.x + 14, y: p.y };
      const fire = reveal => {
        const b = structuredClone(h.lastBatch), a = b.frame.actors.find(x => x.uid === uid);
        b.frame.revealed[a.regionId] = reveal;
        b.events = [{ type: 'impact', owner: 'player', bullet: 'mall-edge-' + reveal, reason: 'hit-actor', target: uid, lastFree: contact, contact, stamp: b.stamp, seq: h.lastSeq + 1, durability: 'accepted' }];
        document.querySelector('[data-hitpop]')?.classList.remove('on'); h.markT = 0;
        h.view.present(b, 0); h.hud(b);
        return { region: a.regionId, shownAt: h.view.shownAt(contact, b.frame.revealed), on: !!document.querySelector('[data-hitpop]')?.classList.contains('on') };
      };
      return { hidden: fire(false), revealed: fire(true) };
    }, [enemy, spot.p]);
    assert.equal(marker.hidden.shownAt, true, 'the contact lies in no room'); assert.equal(marker.hidden.on, false, 'no marker for a hidden target');
    assert.equal(marker.revealed.on, true, 'control: a revealed target is marked');
    await page.evaluate(uid => window.__bincovSample.driver.kill(uid), enemy); await frames(page, 10);
    const blood = () => page.evaluate(([p]) => {
      const v = window.__bincovSample.host.view, near = v.fx.decals.filter(d => Math.abs(d.s.x - p.x) < 24 && Math.abs(d.s.y - p.y) < 16);
      return { near: near.length, visible: near.filter(d => d.s.visible).length, outside: near.filter(d => d.s.x >= p.x + 6).length };
    }, [spot.p]);
    const hidden = await blood();
    assert.ok(hidden.near >= 10 && hidden.outside >= 1, JSON.stringify(hidden)); assert.equal(hidden.visible, 0, 'no blood shows while its room is unrevealed');
    await place(page, spot.p.x / 32 + .5, spot.p.y / 32, Math.PI, 'mall-f1').catch(() => place(page, spot.p.x / 32 + 1, spot.p.y / 32 + 1, Math.PI, 'mall-f1'));
    await frames(page, 10);
    const shown = await blood();
    assert.ok(shown.visible >= 1, 'control: the blood shows once the room is revealed');
    return { spot, enemy, marker, hidden, shown };
  });
  await step('M03c (#26 F14) an unrevealed room is shaded, furniture and all, from the corridor; the shade lifts with its lights and shows nothing of who is inside', async () => {
    // A room seen straight on from open floor in no room, three cells out: no wall between, but too far to be revealed.
    await place(page, 59.5, 4.5, Math.PI / 2, 'mall-f1'); await frames(page, 6);
    const spot = await page.evaluate(() => {
      const m = window.__bincovSample.host.view.mapDef, T = 32, cell = (x, y) => m.cells[y]?.[x];
      const rooms = (x, y) => m.regions.filter(r => r.inside && x * T + 16 >= r.x && x * T + 16 < r.x + r.w && y * T + 16 >= r.y && y * T + 16 < r.y + r.h);
      const open = (x, y) => cell(x, y) === 'floor' && rooms(x, y).length === 0;
      for (const r of m.regions) {
        if (!r.inside || r.sealed) continue;
        const x0 = r.x / T, y0 = r.y / T, x1 = (r.x + r.w) / T - 1, y1 = (r.y + r.h) / T - 1;
        for (const [dx, dy, edge, a, b] of [[-1, 0, x0, y0, y1], [1, 0, x1, y0, y1], [0, -1, y0, x0, x1], [0, 1, y1, x0, x1]]) for (let t = a + 1; t < b; t++) {
          const at = d => dx ? [edge + dx * d, t] : [t, edge + dy * d];
          const [ex, ey] = at(0), [ix, iy] = at(-2), [sx, sy] = at(3);
          if (cell(ex, ey) !== 'floor' || cell(ix, iy) !== 'floor' || [1, 2, 3].some(d => !open(...at(d)))) continue;
          if (rooms(ix, iy).length !== 1 || rooms(ex, ey).length !== 1) continue;
          return { room: r.id, stand: [sx + .5, sy + .5], inside: [ix + .5, iy + .5], corridor: at(1).map(c => c + .5), angle: Math.atan2(-dy, -dx) };
        }
      }
      return null;
    });
    assert.ok(spot, 'a room seen straight on from open floor');
    await place(page, spot.stand[0], spot.stand[1], spot.angle, 'mall-f1'); await frames(page, 20);
    const r = await page.evaluate(spot => {
      const h = window.__bincovSample.host, v = h.view, L = v.light, dt = 1 / 60, m = v.mapDef, T = 32;
      const live = h.lastBatch.frame, rooms = m.regions.filter(x => x.inside && !x.sealed), others = rooms.filter(x => x.id !== spot.room);
      h.app.ticker.stop();
      try {
        const base = structuredClone(h.lastBatch);
        const enemy = base.frame.actors.find(a => a.alive && a.uid !== base.frame.player.uid);
        base.events = []; base.frame.actors = base.frame.actors.filter(a => a.uid === base.frame.player.uid);
        base.frame.loot = []; base.frame.containers = []; base.frame.bullets = [];
        // Pin everything else a present moves (camera, recoil, shake, mist shelter, flicker time), as M17 does.
        const cam = { ...v.camF }, recoil = { ...v.recoil }, shelter = v.weather.shelter;
        const grab = (reveal, step = dt, edit) => {
          const b = structuredClone(base); b.frame.revealed[spot.room] = reveal; edit?.(b.frame);
          v.camF = { ...cam }; v.recoil = { ...recoil }; v.shake = 0; v.weather.shelter = shelter; v.time = 7.25 - step;
          v.present(b, step); h.app.render();
          const out = h.app.renderer.extract.pixels(v.upRT);
          return { px: out.pixels.slice(), w: out.width };
        };
        const k = v.view.k, block = (g, c) => {
          const cx = Math.floor((c[0] * T - v.cam.x) * k), cy = Math.floor((c[1] * T + 8 - v.cam.y) * k);
          let s = 0, n = 0;
          for (let y = cy - 3; y <= cy + 3; y++) for (let x = cx - 3; x <= cx + 3; x++) { const i = (y * g.w + x) * 4; s += g.px[i] + g.px[i + 1] + g.px[i + 2]; n++; }
          return s / n;
        };
        const exact = (a, b) => { let n = 0; for (let i = 0; i < a.px.length; i += 4) if (a.px[i] !== b.px[i] || a.px[i + 1] !== b.px[i + 1] || a.px[i + 2] !== b.px[i + 2]) n++; return n; };
        // Share of the room's on-screen rectangle that the shade darkened by at least 8%.
        const room = m.regions.find(x => x.id === spot.room), darker = (a, b) => {
          const x0 = Math.max(0, Math.floor((room.x - v.cam.x) * k)), x1 = Math.min(a.w, Math.floor((room.x + room.w - v.cam.x) * k));
          const y0 = Math.max(0, Math.floor((room.y - v.cam.y) * k)), y1 = Math.min(a.px.length / 4 / a.w, Math.floor((room.y + room.h - v.cam.y) * k));
          let n = 0, all = 0;
          for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * a.w + x) * 4; all++; if (a.px[i] + a.px[i + 1] + a.px[i + 2] <= .92 * (b.px[i] + b.px[i + 1] + b.px[i + 2])) n++; }
          return all ? n / all : 0;
        };
        const inRoom = p => p.x >= room.x && p.x < room.x + room.w && p.y >= room.y && p.y < room.y + room.h;
        const tinted = () => v.occluders.filter(o => o.kind === 'prop' && o.sprite.renderable && o.tintAt && inRoom(o.tintAt)).map(o => o.sprite.tint);
        // Controls shade every other room as usual and leave this one out.
        const hidden = grab(false), hiddenTints = tinted();
        L.setUnseen(m, others);
        const control = grab(false), controlTints = tinted();
        L.setUnseen(m, rooms);
        const again = grab(false);
        // Who is inside never shows: the same hidden frame with an enemy standing in the room.
        const occupied = enemy ? grab(false, dt, f => f.actors.push({ ...enemy, x: spot.inside[0] * T, y: spot.inside[1] * T, regionId: spot.room })) : null;
        const first = grab(true);
        for (let n = 0; n < 20; n++) grab(true);
        const settled = grab(true);
        L.setUnseen(m, others);
        const settledControl = grab(true);
        L.setUnseen(m, rooms); grab(true);
        const rehidden = grab(false, 0);
        const ch = (c, s) => (c >> s) & 255;
        return {
          room: spot.room, liveRevealed: live.revealed[spot.room],
          floor: { hidden: block(hidden, spot.inside), control: block(control, spot.inside), first: block(first, spot.inside), settled: block(settled, spot.inside) },
          corridor: { hidden: block(hidden, spot.corridor), control: block(control, spot.corridor) },
          darker: darker(hidden, control), againVsHidden: exact(again, hidden), occupiedVsHidden: occupied ? exact(occupied, hidden) : null, enemy: enemy?.uid ?? null,
          props: hiddenTints.length, propRatio: hiddenTints.length ? Math.max(...hiddenTints.flatMap((t, i) => [16, 8, 0].map(s => ch(t, s) / Math.max(1, ch(controlTints[i], s))))) : null,
          settledVsControl: exact(settled, settledControl), rehiddenVsHidden: exact(rehidden, hidden),
        };
      } finally { h.app.ticker.start(); }
    }, spot);
    await frames(page, 4);
    assert.equal(r.liveRevealed, false, `${r.room} is not revealed from three cells out`);
    assert.ok(r.floor.hidden <= .85 * r.floor.control, `the hidden room's floor is shaded: ${JSON.stringify(r.floor)}`);
    assert.ok(r.floor.hidden >= .4 * r.floor.control, `but not blacked out: ${JSON.stringify(r.floor)}`);
    assert.equal(r.corridor.hidden, r.corridor.control, 'the corridor outside the room is untouched');
    assert.ok(r.darker >= .6, `most of the room on screen, furniture included, is darker: ${(r.darker * 100).toFixed(1)}%`);
    assert.ok(r.props >= 1 && r.propRatio <= .75, `furniture in the room takes the shade: ${r.props} props, worst channel ratio ${r.propRatio}`);
    assert.equal(r.againVsHidden, 0, 'restoring the shade draws the same hidden frame');
    assert.ok(r.enemy, 'an enemy to stand in the room'); assert.equal(r.occupiedVsHidden, 0, 'an enemy in the hidden room changes no pixel');
    assert.ok(r.floor.first > r.floor.hidden && r.floor.first < r.floor.settled, `the shade lifts over the lights' 0.3 s: ${JSON.stringify(r.floor)}`);
    assert.equal(r.settledVsControl, 0, 'once revealed nothing of the shade is left');
    assert.equal(r.rehiddenVsHidden, 0, 'hidden again, the shade is back in the same frame (dt 0)');
    return r;
  });
  await step('M04 the S-N stairs take the player up and back down; each floor keeps its own dressing', async () => {
    const rides = [];
    for (const [from, to, map] of [['mall-f1', 'mall-f2', 'mall-f1'], ['mall-f2', 'mall-f1', 'mall-f2']]) {
      await place(page, 62.5, 13.6, -Math.PI / 2, map); await frames(page, 6);
      const before = await now(page); assert.equal(before.map, from); assert.equal(before.interaction?.kind, 'entry', JSON.stringify(before.interaction));
      const t0 = Date.now(); await page.keyboard.press('e');
      await page.waitForFunction(m => window.__bincovSample.host.lastBatch.stamp.world.mapId === m, to, { timeout: 10000 });
      await frames(page, 6);
      const after = await page.evaluate(() => { const v = window.__bincovSample.host.view; return { map: v.mapDef.key.mapId, rebuildMs: v.stats.rebuildMs, occluders: v.stats.occluders, flights: [...v.mall.flights], pages: window.__bincovSample.counts().atlasPages, bytes: v.textureBytes() }; });
      rides.push({ from, to, ms: Date.now() - t0, ...after });
      assert.equal(after.map, to); assert.ok(after.rebuildMs < 1500, `rebuild ${after.rebuildMs} ms`);
    }
    assert.deepEqual(rides.map(r => r.flights[0]), ['S-N-down', 'S-N-up']);
    return rides;
  });
  await step('M05 exits are listed and pointed at on the ground floor only', async () => {
    await place(page, 59.5, 4.5, Math.PI / 2, 'mall-f1'); await frames(page, 6);
    await page.keyboard.press('m'); await frames(page, 4);
    const f1 = await page.locator('[data-exit] option').count(), first = await page.locator('[data-exit] option').nth(1).getAttribute('value');
    await page.locator('[data-exit]').selectOption(first); await frames(page, 2);
    await page.locator('[data-panel] [data-do="close"]').click(); await frames(page, 6);
    // Away from the exit (its ring off screen) the pointer is an arrow on the screen edge.
    await place(page, 35.5, 23.6, 0, 'mall-f1'); await frames(page, 20);
    const state = await page.evaluate(() => { const h = window.__bincovSample.host, el = h.q('[data-exitptr]'); return { selected: h.selectedExit, panel: h.panel, hidden: el.hidden, cls: el.className, exits: h.lastBatch.map.exits.map(e => e.name), box: el.getBoundingClientRect().toJSON() }; });
    await place(page, 61.5, 14.6, Math.PI / 2, 'mall-f2'); await frames(page, 6);
    await page.keyboard.press('m'); await frames(page, 4);
    const f2 = await page.locator('[data-exit] option').count(), disabled = await page.locator('[data-exit]').isDisabled();
    await page.locator('[data-panel] [data-do="close"]').click(); await frames(page, 4);
    const pointerF2 = await page.evaluate(() => !window.__bincovSample.host.q('[data-exitptr]').hidden);
    assert.ok(f1 >= 3, `F1 exits ${f1 - 1}`); assert.ok(!state.hidden && state.cls.includes('edge'), JSON.stringify(state)); assert.equal(f2, 1); assert.ok(disabled); assert.equal(pointerF2, false);
    return { f1: f1 - 1, first, f2: f2 - 1, pointer: state, pointerF2 };
  });
  await step('M06 rain falls on the plaza and the terrace, never inside the footprint', async () => {
    const drops = async (x, y, map) => { await place(page, x, y, Math.PI / 2, map); await frames(page, 40); return page.evaluate(() => {
      const w = window.__bincovSample.host.view.weather, inside = s => s.visible && s.x >= 8 * 32 && s.x < 65 * 32 && s.y >= 6 * 32 && s.y < 49 * 32;
      return { front: w.front.visible, drops: w.stats.drops, splashesInside: w.back.children.filter(inside).length };
    }); };
    const plaza = await drops(59.5, 4.5, 'mall-f1'), terrace = await drops(68.5, 33.6, 'mall-f2');
    await shot(page, 'm06-f2-terrace-1280.png');
    assert.ok(plaza.front && plaza.drops > 0, JSON.stringify(plaza)); assert.ok(terrace.drops > 0, JSON.stringify(terrace));
    assert.equal(plaza.splashesInside, 0); assert.equal(terrace.splashesInside, 0);
    return { plaza, terrace };
  });
  await step('M07 five view remounts on the live Runtime keep listeners, render targets, canvases and textures flat', async () => {
    await place(page, 47.5, 34.6, Math.PI / 2, 'mall-f1'); await frames(page, 10);
    const first = await page.evaluate(() => window.__bincovSample.counts());
    await page.evaluate(() => window.__bincovSample.remount(5)); await frames(page, 10);
    const last = await page.evaluate(() => window.__bincovSample.counts());
    for (const k of ['listeners', 'tickers', 'observers', 'apps', 'parked', 'views', 'renderTextures', 'liveViews', 'canvases', 'sampleRoots']) assert.equal(last[k], first[k], k);
    assert.ok(last.gpuTextures <= first.gpuTextures + 2, `GPU textures ${first.gpuTextures} -> ${last.gpuTextures}`);
    await shot(page, 'm07-f1-fresh-cold-1280.png');
    return { first, last };
  });
  await step('M08 1920x1080: the lobby and the home store, at the default whole-number scale (2, 960x540 world px)', async () => {
    await page.setViewportSize({ width: 1920, height: 1080 }); await frames(page, 6);
    await place(page, 59.5, 13.6, Math.PI / 2, 'mall-f1'); await frames(page, 30); await shot(page, 'm08-f1-lobby-1920.png');
    await place(page, 62, 27.6, 0, 'mall-f2'); await frames(page, 30); await shot(page, 'm08-f2-home-1920.png');
    const s = await page.evaluate(() => { const v = window.__bincovSample.host.view; return { view: v.view, screenScale: v.screen.scale.x, frameMs: v.stats.frameMs }; });
    assert.ok(s.view.W >= 1900);
    // fit is 2.5 here; the default takes 2, so the upscale is 2x nearest and the screen is copied 1:1.
    assert.deepEqual([s.view.s, s.view.k, s.view.w, s.view.h], [2, 2, 960, 540]); assert.equal(s.screenScale, 1);
    return s;
  });
  await step('M15 entrances are marked (door guides over the gap, a sill on the floor), headers only on entrances; the run starts on the plaza; the HUD names places', async () => {
    await place(page, 59.5, 22.5, Math.PI, 'mall-f1'); await frames(page, 10);
    const near = await page.evaluate(() => {
      const v = window.__bincovSample.host.view, list = v.openingGuides;
      return { total: list.length, shown: list.filter(o => o.s.visible).map(o => ({ x: Math.round(o.at.x / 32 - .5), y: Math.round(o.at.y / 32 - .5) })), openings: v.mall.openings.length,
        sills: v.mall.ground.sills.length, lintels: v.mall.lintels.length, where: document.querySelector('[data-where]').textContent };
    });
    await shot(page, 'm15-f1-side-door-1280.png');
    await place(page, 48.5, 3.5, 0, 'mall-f1'); await frames(page, 10);
    const plaza = await page.evaluate(() => document.querySelector('[data-where]').textContent);
    assert.equal(near.total, 12, 'one guide per F1 entrance');
    assert.ok(!near.shown.some(o => o.x <= 9), 'the west entrance, far away, shows no guide');
    assert.ok(near.shown.some(o => o.x === 57 && o.y === 22), `the store's side door is marked: ${JSON.stringify(near.shown)}`);
    assert.equal(near.lintels, 9, 'headers over the three east-west entrances only');
    // Layout 4 furnishes the store, so it is no longer marked as outside the sample.
    assert.match(near.where, /一层 · 湾角便利$/); assert.match(plaza, /一层 · 正门广场 · 室外$/);
    return { near, plaza };
  });
  await step('M14 stairs: no label beside the drawn flight but floor arrows to it; other stairs are named in the HUD face when near; pieces sit on their drawn base', async () => {
    await page.setViewportSize({ width: 1280, height: 720 }); await frames(page, 4);
    const labels = () => page.evaluate(() => [...document.querySelectorAll('.cs-stair')].filter(e => !e.hidden).map(e => ({ text: e.textContent, font: getComputedStyle(e).fontFamily, r: e.getBoundingClientRect().toJSON() })));
    await place(page, 59.5, 15.5, Math.PI / 2, 'mall-f1'); await frames(page, 10);
    const lobby = { labels: await labels(), guides: await page.evaluate(() => window.__bincovSample.host.view.mall.ground.guides) };
    await shot(page, 'm14-f1-lobby-arrows-1280.png');
    await place(page, 41.5, 15.5, Math.PI / 2, 'mall-f1'); await frames(page, 10);
    const near = await labels(); await shot(page, 'm14-f1-escalator-label-1280.png');
    await place(page, 59.5, 4.5, Math.PI / 2, 'mall-f1'); await frames(page, 10);
    const far = await labels();
    // On the stair point the interaction prompt names it; the label steps aside.
    const ec = await page.evaluate(() => window.__bincovSample.host.lastBatch.map.entries.find(e => e.id === 'E-C-up').at);
    await place(page, ec.x / 32, ec.y / 32, Math.PI / 2, 'mall-f1'); await frames(page, 10);
    const onIt = { labels: await labels(), prompt: await page.evaluate(() => { const p = document.querySelector('[data-prompt]'); return p.hidden ? null : p.textContent; }) };
    const feet = await page.evaluate(() => {
      const v = window.__bincovSample.host.view, d = v.mall;
      return { mallF1: d.ground.feet.length, rendered: [...v.stairLabels.values()].some(s => s.renderable) };
    });
    await place(page, 62, 27.6, 0, 'mall-f2'); await frames(page, 10);
    const home = await page.evaluate(() => {
      const v = window.__bincovSample.host.view, d = v.mall;
      const gap = asset => { const c = v.tex.canvas('mall:' + asset), a = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let n = 0; for (let y = c.height - 1; y >= 0; y--, n++) { let any = false; for (let x = 0; x < c.width; x++) if (a[(y * c.width + x) * 4 + 3]) { any = true; break; } if (any) break; } return n; };
      const sized = n => d.props.filter(p => p.asset.includes(n)).map(p => ({ asset: p.asset, z: p.z, gap: gap(p.asset), foot: d.ground.feet.find(f => f.x === p.foot.x && f.y === p.foot.y) }));
      const lamp = d.props.filter(p => p.asset.includes('floor-lamp')).map(p => ({ z: p.z, foot: p.foot }));
      return { sofa: sized('sofa'), bed: sized('prop-bed'), bench: sized('bench'), table: sized('coffee-table'), lamp, cafe: d.props.filter(p => p.asset.includes('cafe-set')).length };
    });
    assert.equal(lobby.labels.length, 0, 'no label beside the drawn S-N flight'); assert.ok(lobby.guides.length >= 2 && lobby.guides.every(g => g.dy === -1), JSON.stringify(lobby.guides));
    assert.ok(near.some(l => l.text === '上楼至二层' && /Bincov Text/.test(l.font)), JSON.stringify(near));
    assert.equal(far.length, 0, 'other stairs are not named from across the floor');
    assert.ok(onIt.prompt?.includes('上楼至二层') && onIt.labels.length === 0, JSON.stringify(onIt));
    assert.equal(feet.rendered, false, 'the world-space label sprite is never drawn');
    for (const p of [...home.sofa, ...home.bed, ...home.bench, ...home.table]) assert.ok(p.foot && p.foot.y + p.foot.h === p.z - p.gap, `shadow ends at the drawn base: ${JSON.stringify(p)}`);
    // F-05 art: the sofa and bed stand on their cell's south edge, the table and bench sit in the middle of theirs.
    assert.deepEqual([...new Set(home.sofa.map(p => p.gap))], [0]); assert.deepEqual([...new Set(home.bed.map(p => p.gap))], [0]);
    assert.deepEqual([...new Set(home.table.map(p => p.gap))], [8]);
    // The contact band under the bed and the bench spans the drawn piece (x4-59 of the 64 px canvas), not the whole footprint.
    for (const p of [...home.bed, ...home.bench]) assert.deepEqual(p.foot.band, { x: p.foot.x + 4, w: 56 }, `contact band under ${p.asset}`);
    for (const l of home.lamp) assert.ok(l.foot.w <= 12 && l.foot.y + l.foot.h < l.z - 8, `the lamp's shadow is its base: ${JSON.stringify(l)}`);
    assert.equal(home.cafe, 4);
    return { lobby, near, far, onIt, home };
  });
  await step('M19 the sealed maintenance core is never cut away, even from the F2 hall that contains it', async () => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await place(page, 49.5, 16.5, Math.PI / 2, 'mall-f2'); await wait(1500); await frames(page, 10);
    const s = await page.evaluate(() => {
      const v = window.__bincovSample.host.view;
      // The core is x45-53, y7-13 on both floors; a wall piece's cell is (rect.x, z - 16).
      const core = v.occluders.filter(o => o.kind === 'wall' && o.rect.x >= 45 * 32 && o.rect.x < 54 * 32 && o.z - 16 >= 7 * 32 && o.z - 16 < 14 * 32);
      return { rooms: [...v.cutRooms], core: core.length, renderable: core.filter(o => o.sprite.renderable).length,
        levels: [...new Set(core.map(o => o.level))].sort(), cut: core.filter(o => o.level >= 3).length };
    });
    await shot(page, 'm19-f2-hall-core-1280.png');
    assert.ok(s.rooms.includes('F2-01'), `the player stands in the hall around the core: ${s.rooms}`);
    assert.equal(s.core, 63, 'one wall piece per core cell'); assert.equal(s.renderable, 63, 'the whole core is in view');
    assert.equal(s.cut, 0, `no core wall is cut away (levels ${s.levels})`);
    return s;
  });
  await step('M17 a room\'s lights come up over 0.3 s once it is revealed and go out in the frame it is hidden', async () => {
    // Last step of this page: its synthetic reveal flips leave light state that no later step should inherit.
    // Wait rule: after a reveal change that does not go through placePlayer (driver.door, real walking), wait 20 frames
    // before a cross-frame pixel compare or a screenshot.
    await place(page, 42.5, 27.5, Math.PI / 2, 'mall-f1'); await frames(page, 30);
    const r = await page.evaluate(room => {
      const h = window.__bincovSample.host, v = h.view, L = v.light, dt = 1 / 60;
      h.app.ticker.stop();
      try {
        const base = structuredClone(h.lastBatch);
        base.events = []; base.frame.actors = base.frame.actors.filter(a => a.uid === base.frame.player.uid);
        base.frame.loot = []; base.frame.containers = []; base.frame.bullets = [];
        // Pin everything else a present moves (camera, recoil, shake, mist shelter, flicker time), so frames differ only by light.
        const cam = { ...v.camF }, recoil = { ...v.recoil }, shelter = v.weather.shelter, before = base.frame.revealed[room];
        const grab = reveal => {
          const b = structuredClone(base); b.frame.revealed[room] = reveal;
          v.camF = { ...cam }; v.recoil = { ...recoil }; v.shake = 0; v.weather.shelter = shelter; v.time = 7.25 - dt;
          v.present(b, dt); h.app.render();
          return h.app.renderer.extract.pixels(v.upRT).pixels.slice();
        };
        const exact = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) n++; return n; };
        const coarse = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) > 12 || Math.abs(a[i + 1] - b[i + 1]) > 12 || Math.abs(a[i + 2] - b[i + 2]) > 12) n++; return n / (a.length / 4); };
        const lights = L.lights.filter(l => l.regions?.includes(room)), lits = () => lights.map(l => l.lit);
        const leaks = () => L.pool.filter(s => s.visible && lights.some(l => Math.round(l.x) === s.x && Math.round(l.y) === s.y)).length;
        const shown = grab(true), shownLit = lits();
        const hidden = grab(false), hiddenLit = lits(), hiddenLeaks = leaks();
        let prev = hidden, frame1 = null, frame9 = null; const steps = [];
        for (let n = 1; n <= 20; n++) {
          const cur = grab(true);
          if (n === 1) frame1 = lits();
          if (n === 9) frame9 = { lit: lits(), vsHidden: exact(cur, hidden), vsShown: exact(cur, shown) };
          steps.push(coarse(prev, cur)); prev = cur;
        }
        const settled = { lit: lits(), vsShown: exact(prev, shown) }, pop = coarse(hidden, shown);
        const again = grab(false), hide = { lit: lits(), leaks: leaks(), vsHidden: exact(again, hidden) };
        return { room, before, shelter, lights: lights.length, shownLit, hiddenLit, hiddenLeaks, frame1, frame9, maxStep: Math.max(...steps), steps: steps.map(s => +(s * 100).toFixed(3)), settled, pop, hide };
      } finally { h.app.ticker.start(); }
    }, 'F1-03');
    await frames(page, 4);
    assert.equal(r.before, true, 'the player stands in the supermarket F1-03'); assert.ok(r.lights >= 3, `F1-03 has its own lights: ${r.lights}`);
    assert.ok(r.shownLit.every(l => l === 1), `revealed: full ${r.shownLit}`);
    assert.ok(r.hiddenLit.every(l => l === 0), `hidden: dark ${r.hiddenLit}`); assert.equal(r.hiddenLeaks, 0, 'no light sprite of a hidden room');
    assert.ok(r.frame1.every(l => l > 0 && l <= .06), `first revealed frame ${r.frame1}`);
    assert.ok(r.maxStep < .01, `each frame changes under 1% of pixels: ${r.steps}`);
    assert.ok(r.frame9.vsHidden > 0 && r.frame9.vsShown > 0, `frame 9 is drawn between dark and full: ${JSON.stringify(r.frame9)}`);
    assert.ok(r.settled.lit.every(l => l === 1), `settled ${r.settled.lit}`); assert.equal(r.settled.vsShown, 0, 'after 20 frames the room matches the instant state');
    assert.ok(r.pop > .05, `control: the instant switch changes over 5% of pixels (${(r.pop * 100).toFixed(2)}%)`);
    assert.ok(r.hide.lit.every(l => l === 0), `hidden again: ${r.hide.lit}`); assert.equal(r.hide.leaks, 0); assert.equal(r.hide.vsHidden, 0, 'hiding is immediate');
    return r;
  });
  await step('M20 layout 4 furnishes every region: painted pieces in the shops, back rooms, upstairs halls and streets; no room is dimmed or outside the sample', async () => {
    const spots = [['pharmacy', 'mall-f1', 18, 13, '滨湾药房'], ['chicken', 'mall-f1', 17, 30, '红帆炸鸡'], ['storeroom', 'mall-f1', 36, 10, '北侧仓库'],
      ['service', 'mall-f1', 18, 45, '西侧服务间'], ['street', 'mall-f1', 30, 49, '车库入口及南街'], ['yard', 'mall-f1', 66, 49, '卸货区'],
      ['fashion', 'mall-f2', 20, 13, '海风服装'], ['office', 'mall-f2', 15, 25, '商场办公室'], ['play', 'mall-f2', 24, 40, '儿童乐园'], ['toilet', 'mall-f2', 12, 38, '厕所']];
    const floors = {}, places = [];
    for (const [size, list] of [[{ width: 1280, height: 720 }, spots], [{ width: 1920, height: 1080 }, spots.filter(s => ['chicken', 'fashion', 'yard'].includes(s[0]))]]) {
      await page.setViewportSize(size); await frames(page, 4);
      for (const [name, map, x, y, place_] of list) {
        await place(page, x, y, 0, map); await frames(page, 30);
        const s = await page.evaluate(() => {
          const v = window.__bincovSample.host.view, m = v.map;
          return { map: m.key.mapId, revision: m.key.layoutRevision, where: document.querySelector('[data-where]').textContent, note: v.sampleNote(),
            painted: v.mall.props.filter(p => p.asset.startsWith('procedural:furniture:')).length,
            dim: m.regions.filter(r => r.inside && v.mall.zone(r.x + r.w / 2, r.y + r.h / 2) === 'dim').map(r => r.id) };
        });
        assert.equal(s.revision, 'mall-layout-4'); assert.equal(s.map, map);
        assert.ok(s.where.includes(place_), `${name}: ${s.where}`); assert.ok(!s.where.includes('样板外'), s.where); assert.equal(s.note, null);
        assert.deepEqual(s.dim, [], 'no room sits darker as outside the sample');
        floors[map] = s.painted; places.push({ name, size: size.width, where: s.where });
        await shot(page, `m20-${name}-${size.width}.png`);
      }
    }
    // Every layout-4 piece or run module without a sample is painted; none falls back to nothing.
    assert.deepEqual(floors, { 'mall-f1': 132, 'mall-f2': 107 });
    await page.setViewportSize({ width: 1280, height: 720 }); await frames(page, 4);
    return { floors, places };
  });
  await context.close();
}
{
  const { context, page } = await open('?test=1&entry=tabs&sample=mall&crisp=1');
  await step('M16 ?crisp=1 scales the world by a whole number (2 at 1280x720), so world pixels stay square', async () => {
    await deployTabs(page);
    const v = await page.evaluate(() => { const { s, k, w, h } = window.__bincovSample.host.view.view; return { s, k, w, h }; });
    await shot(page, 'm16-crisp-1280.png');
    assert.equal(v.s, 2); assert.equal(v.k, 2); assert.deepEqual([v.w, v.h], [640, 360]);
    return v;
  });
  await context.close();
}
{
  const { context, page } = await open('?test=1&entry=tabs&sample=mall&crisp=0', { width: 1920, height: 1080 });
  await step('M16b ?crisp=0 keeps the old fractional picture (2.5 at 1920x1080, 24 cells wide) for comparison', async () => {
    await deployTabs(page);
    const v = await page.evaluate(() => { const view = window.__bincovSample.host.view, { s, k, w, h } = view.view; return { s, k, w, h, screenScale: view.screen.scale.x }; });
    await shot(page, 'm16b-crisp0-1920.png');
    assert.deepEqual([v.s, v.k, v.w, v.h], [2.5, 3, 768, 432]); assert.equal(v.screenScale, 2.5 / 3);
    return v;
  });
  await context.close();
}
const savedWorld = page => page.evaluate(() => /"worldVersion":"([^"]+)"/.exec(localStorage.getItem('escape-bincov.session.v2') ?? '')?.[1] ?? null);
{
  const { context, page } = await open('?sample=mall');
  await step('M09 without ?test=1 the station yard deploys the mall sample on layout 4 and exposes no test interface', async () => {
    await action(page, 'enter').click(); await deployFromYard(page, { world: 'mall', seed: 43 });
    await page.waitForSelector('.coast-sample canvas', { timeout: 60000 }); await wait(600);
    const s = await page.evaluate(() => ({ test: typeof window.__bincovSample, bincov: typeof window.__bincov, roots: document.querySelectorAll('.coast-sample').length }));
    s.worldVersion = await savedWorld(page);
    assert.deepEqual(s, { test: 'undefined', bincov: 'undefined', roots: 1, worldVersion: 'mall-v4' });
    await shot(page, 'm09-yard-deploy-1280.png');
    return s;
  });
  await context.close();
}
{
  // Layout 3 moved the living-room coffee table (layout 4 keeps it there); a raid deployed on layout 2 keeps layout 2 (and the 2.5D view) until it ends.
  const { context, page } = await open('?test=1&entry=tabs&sample=mall');
  await step('M18 a layout-2 raid continues on layout 2 in the 2.5D view with the old table; the next deploy is layout 4 with the table centred on the sofa', async () => {
    const living = () => page.evaluate(() => {
      const h = window.__bincovSample.host, d = h.view.mall, key = h.lastBatch.stamp.world, pieces = n => d.props.filter(p => p.asset.includes(n));
      return { world: [key.worldVersion, key.layoutRevision, key.mapId], saved: h.session.expansion.raid.worldVersion,
        mallArt: window.__bincovSample.counts().mallArt, sofas: pieces('sofa').map(p => ({ x: p.x, z: p.z })),
        tables: pieces('coffee-table').map(p => ({ x: p.x, z: p.z, shadow: d.ground.feet.find(f => f.x === p.foot.x && f.y === p.foot.y) ?? null })) };
    });
    // Beside the first living room, so the screenshot shows the sofa and its table.
    const onFloorTwo = async () => { await page.evaluate(() => window.__bincovSample.driver.freezeAI(true)); await place(page, 62, 20.6, 0, 'mall-f2'); await frames(page, 10); return living(); };
    // An older raid: deployed on layout 2 (as the sample did before layout 3), then the page is reloaded and continued.
    await action(page, 'enter').click(); assert.equal(await page.locator('#run-world').inputValue(), 'mall');
    assert.equal(await page.evaluate(() => window.__bincov.saveSession.beginRun(42, 'mall', { mallLayout: 2 })), true);
    assert.equal(await savedWorld(page), 'mall-v2');
    await page.reload(); await action(page, 'enter').click();
    await page.waitForFunction(() => !!window.__bincovSample?.host?.lastBatch, null, { timeout: 60000 });
    await page.locator('[data-do="resume"]').click(); await frames(page, 3);
    const old = await onFloorTwo(); await shot(page, 'm18-f2-layout2-continued-1280.png');
    assert.deepEqual(old.world, ['mall-v2', 'mall-layout-2', 'mall-f2']); assert.equal(old.saved, 'mall-v2');
    assert.equal(old.mallArt, 'sol');
    assert.deepEqual(old.tables.map(t => [t.x, t.z]), [[58 * 32, 21 * 32], [58 * 32, 35 * 32]], 'the layout-2 table, one row clear of the sofa');
    // Abandon it and deploy again from the same tab page: the new raid is layout 4.
    await page.keyboard.press('Escape'); await frames(page, 2);
    await page.locator('[data-do="abandon"]').click(); await page.locator('[data-do="abandon-yes"]').click();
    await page.waitForFunction(() => window.__bincov.app.state === 'result' && !document.querySelector('.coast-sample'), null, { timeout: 30000 });
    await action(page, 'return').click();
    assert.equal(await page.locator('#run-world').inputValue(), 'mall');
    await page.locator('#seed').fill('42'); await action(page, 'deploy').click();
    await page.waitForFunction(() => !!window.__bincovSample?.host?.lastBatch, null, { timeout: 60000 });
    const next = await onFloorTwo(); await shot(page, 'm18-f2-layout4-deployed-1280.png');
    assert.deepEqual(next.world, ['mall-v4', 'mall-layout-4', 'mall-f2']); assert.equal(next.saved, 'mall-v4');
    assert.deepEqual(next.tables.map(t => [t.x, t.z]), [[1872, 20 * 32], [1872, 34 * 32]], 'the layout-3 table (kept by layout 4), right in front of the sofa');
    for (const t of next.tables) {
      const sofa = next.sofas.find(s => s.z === t.z - 32);
      assert.ok(sofa && t.x + 16 === sofa.x + 32, `the table is centred on its sofa: ${JSON.stringify({ t, sofa })}`);
      // Its shadow is the drawn table (32 px), not the two cells it blocks.
      assert.ok(t.shadow && t.shadow.x === t.x && t.shadow.w === 32 && t.shadow.band.x >= t.x && t.shadow.band.x + t.shadow.band.w <= t.x + 32, JSON.stringify(t));
    }
    return { old, next };
  });
  await context.close();
}
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, offline: true }), page = await context.newPage();
  page.on('pageerror', e => report.errors.push(e.stack ?? e.message));
  await step('M13 the playtest launcher 商场试玩.html opens the offline game with the mall sample on', async () => {
    await page.goto(pathToFileURL(resolve('商场试玩.html')).href + '?weather=clear');
    await page.waitForURL(/start%20the%20game\.html\?sample=mall&weather=clear/);
    return { url: page.url().replace(/^.*\//, '') };
  });
  await context.close();
}
{
  const { context, page } = await open('?test=1&entry=tabs');
  await step('M10 a test page without sample= deploys like the ordinary entry: layout 4 on the 2.5D view, no playtest marks', async () => {
    await action(page, 'enter').click(); await page.locator('#run-world').selectOption('mall'); await page.locator('#seed').fill('42'); await action(page, 'deploy').click();
    await page.waitForFunction(() => !!window.__bincovSample?.host?.lastBatch, null, { timeout: 60000 });
    await page.waitForFunction(() => (document.querySelector('.coast-sample [data-where]')?.textContent ?? '').length > 0);
    const s = await page.evaluate(() => ({ sample: document.querySelectorAll('.coast-sample').length, coastSample: !!window.__bincov.app.coastSample,
      marks: window.__bincovSample.host.view.opts.sampleMarks, where: document.querySelector('.coast-sample [data-where]').textContent }));
    s.worldVersion = await savedWorld(page);
    assert.ok(s.where.startsWith('滨湾商场') && !s.where.includes('样板外'), s.where);
    assert.deepEqual({ ...s, where: undefined }, { sample: 1, coastSample: true, marks: false, worldVersion: 'mall-v4', where: undefined });
    return s;
  });
  await context.close();
}
{
  const { context, page } = await open('?test=1&entry=tabs&sample=mall&art=placeholder');
  await step('M11 without art the mall floors keep the generic placeholder pipeline', async () => {
    await deployTabs(page);
    const s = await page.evaluate(() => { const c = window.__bincovSample.counts(), v = window.__bincovSample.host.view; return { art: c.art, mallArt: c.mallArt, mall: !!v.mall, occluders: v.stats.occluders }; });
    assert.deepEqual({ art: s.art, mallArt: s.mallArt, mall: s.mall }, { art: 'placeholder', mallArt: 'placeholder', mall: false });
    // Without the samples the building still keeps the rain out and thins the mist indoors.
    const weather = async (x, y) => { await place(page, x, y, Math.PI / 2, 'mall-f1'); await wait(1500); await frames(page, 20); return page.evaluate(() => {
      const w = window.__bincovSample.host.view.weather, inside = s => s.visible && s.x >= 8 * 32 && s.x < 65 * 32 && s.y >= 6 * 32 && s.y < 49 * 32;
      return { drops: w.stats.drops, splashesInside: w.back.children.filter(inside).length, shelter: w.shelter };
    }); };
    const hall = await weather(40, 25), plaza = await weather(59.5, 4.5);
    assert.equal(hall.splashesInside, 0); assert.ok(hall.shelter > .8, JSON.stringify(hall));
    assert.ok(plaza.drops > 0 && plaza.shelter < .2, JSON.stringify(plaza));
    await shot(page, 'm11-placeholder-1280.png');
    return { ...s, hall, plaza };
  });
  await context.close();
}
{
  const { context, page } = await open('?test=1&entry=tabs&sample=village');
  await step('M12 the village sample still preselects 沿海街区', async () => {
    await action(page, 'enter').click();
    const world = await page.locator('#run-world').inputValue();
    assert.equal(world, 'buildings');
    return { world };
  });
  await context.close();
}
await browser.close();
report.finishedAt = new Date().toISOString();
report.passed = report.steps.filter(s => s.status === 'passed').length; report.failed = report.steps.length - report.passed;
await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
console.log(`${report.passed}/${report.steps.length} passed; errors ${report.errors.length}; external requests ${report.requests.length}`);
if (report.failed) process.exitCode = 1;
