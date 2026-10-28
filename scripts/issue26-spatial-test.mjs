// Real offline build and Runtime; ?test=1 only positions actors and freezes AI (S03b also presents one probe bullet to the
// view, never to the Runtime). Run this unchanged against --html=<baseline/index.html> for the old-build negative control.
// No screenshots or assertions are mocked.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import { resumeStalls, running, stallResumes } from './stall-resume.mjs';

const option = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const html = await readFile(option('html', 'dist/index.html'), 'utf8'), out = resolve(option('out', 'test-results/issue26-spatial'));
await mkdir(out, { recursive: true });
const browser = await chromium.launch(browserOptions);
const report = { sha256: createHash('sha256').update(html).digest('hex'), browser: browser.version(), checks: [], errors: [] };
let context, page, size;
const frames = (n = 3) => page.evaluate(n => new Promise(resolve => { let count = 0; const tick = () => ++count >= n ? resolve() : requestAnimationFrame(tick); requestAnimationFrame(tick); }), n);
const place = (x, y, map = 'coast') => page.evaluate(([x, y, map]) => window.__bincovSample.driver.placePlayer({ x, y }, -Math.PI / 2, map), [x, y, map]);
/**
 * Captures stop the ticker. On a slow runner a stop over 2 s makes the Runtime stall-pause the raid when it restarts (its
 * rule for a frozen tab); resume such a pause, and only one that a new stall caused, before the next real input.
 */
let seenStall = null;
async function resumeStall() {
  // The Runtime announces a stall pause with its own notice (画面暂时停顿…); the newest one's sequence number marks it.
  const stall = await page.evaluate(() => [...(window.__bincovSample?.host?.eventLog ?? [])].reverse()
    .find(e => e.type === 'notice' && String(e.detail?.text ?? '').startsWith('画面暂时停顿'))?.seq ?? null);
  if (stall === null || stall === seenStall) return;
  seenStall = stall;
  if (await page.evaluate(() => window.__bincovSample.host.panel === 'pause')) {
    console.log(`${size.join('x')} resumed a stall pause after a capture`);
    await page.locator('.coast-sample [data-do="resume"]').click();
    await page.waitForFunction(() => window.__bincovSample.host.panel === null); await frames(2);
  }
}
const settle = async () => { await page.waitForTimeout(300); await frames(4); await resumeStall(); };
/**
 * E on the stairs until the floor changes. A stall pause (resumed by resumeStalls) swallows a press made while it shows,
 * so the press is made again once the raid runs; any other outcome fails after the timeout.
 */
async function takeStairs(target) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await running(page);
    const stalls = await stallResumes(page) ?? 0;
    await page.keyboard.press('e');
    const outcome = await (await page.waitForFunction(([t, s]) => window.__bincovSample.host.lastBatch.stamp.world.mapId === t ? 'done'
      : (window.__stallResumes ?? 0) !== s ? 'stalled' : false, [target, stalls], { timeout: 45000 })).jsonValue();
    if (outcome === 'done') return;
  }
  throw new Error(`The stairs did not take the player to ${target}`);
}
async function check(name, task) {
  const row = { name: `${size.join('x')} ${name}` }; report.checks.push(row);
  try { row.detail = await task(); assert.deepEqual(report.errors, []); row.status = 'passed'; }
  catch (e) { row.status = 'failed'; row.error = String(e.stack); process.exitCode = 1; }
  await page.screenshot({ path: resolve(out, `${size.join('x')}-${name.split(' ')[0]}.png`) }).catch(() => {});
  console.log(row.status, row.name, row.error?.split('\n')[0] ?? '');
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2));
}
const guides = () => page.evaluate(() => {
  const h = window.__bincovSample.host, v = h.view, b = h.lastBatch;
  return { map: b.map.key.mapId, floor: b.map.floor, revealed: b.frame.revealed,
    doors: b.map.doors.map(d => ({ id: d.id, wall: d.wall, open: !!b.frame.doors[d.id], visible: !!v.doorGuides?.get(d.id)?.visible,
      x: v.doorGuides?.get(d.id)?.x, y: v.doorGuides?.get(d.id)?.y })),
    labels: b.map.entries.map(e => ({ label: e.label, visible: !!v.stairLabels?.get(e.id)?.visible })),
    structures: v.occluders.map(o => ({ kind: o.kind, x: o.rect.x, y: o.z - 16, region: o.region, level: o.level, target: o.target, visible: o.sprite.visible,
      cell: o.cell, rule: o.wall?.rule, mode: o.wall?.mode })) };
});
/**
 * Occlusion of an entity by a guide or label (the rule of the retired Phaser checks P08/P09), from four reads of the same
 * pixels: A entity + guide, B guide only, C entity only, D neither. body = pixels the entity changes (C vs D); guide =
 * pixels the guide changes (B vs D). An entity pixel with alpha a drawn over the guide gives A - C = (1 - a)(B - D) on
 * every channel, so the guide shows only through translucent entity pixels (blended). covered = body pixels where A
 * differs from C in any other way, i.e. the guide is drawn on top of the entity. overlap = pixels both change: the control
 * that the entity really sits on the guide, so covered === 0 cannot pass only because the two never meet.
 */
const OCCLUSION = `window.__occlusion = ({ A, B, C, D }) => {
  let body = 0, covered = 0, blended = 0, guide = 0, overlap = 0; const differs = (x, y, i) => x[i] !== y[i] || x[i + 1] !== y[i + 1] || x[i + 2] !== y[i + 2];
  for (let i = 0; i < A.length; i += 4) {
    if (differs(C, D, i)) { body++;
      if (differs(A, C, i)) {
        const u = [0, 1, 2].map(j => A[i + j] - C[i + j]), v = [0, 1, 2].map(j => B[i + j] - D[i + j]), vv = v.reduce((s, x) => s + x * x, 0);
        const k = vv ? u.reduce((s, x, j) => s + x * v[j], 0) / vv : NaN;
        if (k >= -.02 && k <= 1.02 && u.every((x, j) => Math.abs(x - k * v[j]) <= 3)) blended++; else covered++;
      }
    }
    if (differs(B, D, i)) { guide++; if (differs(C, D, i)) overlap++; }
  }
  return { pixels: A.length / 4, body, covered, blended, guide, overlap };
};`;
/** A page capture as RGBA in the page (the HUD's stair labels are page text above the canvas). */
const decode = b64 => `new Promise(done => { const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = i.width; c.height = i.height;
  const g = c.getContext('2d'); g.drawImage(i, 0, 0); done(g.getImageData(0, 0, i.width, i.height).data); }; i.src = 'data:image/png;base64,' + ${JSON.stringify(b64)}; })`;
/**
 * Front-end gaps the occlusion checks found on the 2.5D view (2026-10-17, reported). Stair names are page text above the
 * canvas, so one covers part of an enemy standing right under it (hiding the name while an enemy is near the stairs would
 * take the destination away in a fight). Door guides step aside for enemies and bullets, so they are not listed.
 * While a gap is listed, its check asserts that the cover is still measured and prints a GAP line; once the view is fixed
 * the guard fails, and removing the entry restores the original assertion (0 covered pixels).
 */
const KNOWN_GAPS = new Set(['stair-label-over-actors']);
function uncovered(gap, covered, what) {
  if (!KNOWN_GAPS.has(gap)) return assert.equal(covered, 0, `${what}: ${covered} covered pixels`);
  (report.gaps ??= []).push({ size: size.join('x'), gap, covered });
  console.log(`GAP front-end: ${size.join('x')} ${what} covers ${covered} pixels (${gap})`);
  assert.ok(covered > 0, `${gap} no longer reproduces (0 covered pixels): remove it from KNOWN_GAPS so the original check applies`);
}
/** Sprites an actor's figure is drawn with (its ground shadow stays: it lies under every guide by design). */
const FIGURE = 'g => [g.body, g.weapon, ...g.arms, g.flash, g.wade]';

try {
  for (size of [[1280, 720], [1920, 1080]]) {
    context = await browser.newContext({ offline: true, viewport: { width: size[0], height: size[1] } });
    await resumeStalls(context);
    context.on('request', r => { if (/^https?:/.test(r.url()) && !r.url().startsWith('https://spatial.test/')) report.errors.push(`external request ${r.url()}`); });
    await context.route('https://spatial.test/**', r => r.fulfill({ contentType: 'text/html', body: html }));
    page = await context.newPage(); page.setDefaultTimeout(30000);
    page.on('pageerror', e => report.errors.push(String(e.stack)));
    await page.goto('https://spatial.test/?test=1&entry=tabs&sample=village&weather=clear');
    await page.locator('[data-action="enter"]').click();
    await page.locator('#run-world').selectOption('buildings'); await page.locator('#seed').fill('42');
    await page.locator('[data-action="deploy"]').click();
    await page.waitForFunction(() => !!window.__bincovSample?.host?.lastBatch);
    await page.evaluate(() => window.__bincovSample.driver.freezeAI(true));
    await page.evaluate(OCCLUSION); await page.evaluate(`window.__figure = ${FIGURE}`);

    await check('S01 exterior-door', async () => {
      await place(464, 448); await settle(); const result = await guides();
      assert.deepEqual(result.doors.filter(d => d.visible).map(d => d.id), ['resident-front']);
      assert.ok(result.labels.every(e => !e.visible));
      assert.ok(Object.values(result.revealed).every(v => !v));
      return result;
    });
    await check('S02 real-open-and-passage', async () => {
      await place(464, 432); await page.evaluate(() => window.__bincovSample.driver.door('resident-front', false)); await settle();
      await page.keyboard.press('e'); await page.waitForFunction(() => window.__bincovSample.host.lastBatch.frame.doors['resident-front']);
      await page.keyboard.down('w');
      try { await page.waitForFunction(() => window.__bincovSample.host.lastBatch.frame.player.y < 370); }
      finally { await page.keyboard.up('w'); }
      await settle(); const result = await guides(), door = result.doors.find(d => d.id === 'resident-front');
      assert.ok(door.open && door.visible); assert.deepEqual([door.x, door.y], [14 * 32, 12 * 32 - 48]);
      assert.ok(result.labels.every(e => e.visible));
      return { door, labels: result.labels, player: await page.evaluate(() => window.__bincovSample.host.lastBatch.frame.player) };
    });
    await check('S03 complete-ground-floor', async () => {
      await place(464, 336); await settle(); const result = await guides();
      assert.equal(result.doors.filter(d => d.wall === 'ns' && d.visible).length, 2);
      assert.deepEqual(result.labels.filter(e => e.visible).map(e => e.label).sort(), ['上楼 · 二楼', '下楼 · 地下'].sort());
      const walls = result.structures.filter(o => ['wall', 'door'].includes(o.kind) && o.x >= 320 && o.x < 608 && o.y >= 224 && o.y < 416);
      // Indoor wall rule (docs/INDOOR-WALL-VISIBILITY-PLAN.md): no dither; the south front only its cells, the rest whole.
      assert.ok(walls.length > 10 && walls.every(o => o.level === 0 && o.mode && o.visible));
      assert.ok(walls.filter(o => o.cell.y === 12).every(o => o.mode === 'base') && walls.filter(o => o.cell.y < 12).every(o => o.mode === 'full'));
      const roof = result.structures.find(o => o.kind === 'roof' && o.region?.endsWith('/resident-ground'));
      assert.ok(roof && roof.level === 4 && !roof.visible);
      return { doors: result.doors, labels: result.labels, walls, roof };
    });
    await check('S03b doorway-enemy-and-bullet-draw-over-the-door-guide', async () => {
      // Phaser P08 on the 2.5D view, from S03's spot: the west door open, a live enemy in its cell and an enemy bullet on its
      // guide. The world target (one pixel per world pixel) is read with the ticker stopped, as in S05, toggling the entity's
      // sprites and the guide for the four reads. The view draws a bullet AIM_H above its ground point and its tail only
      // after 3 px of flight, so the probe bullet is presented (view only; it never enters the Runtime) in the cell's south
      // part, 10 px into its flight.
      await place(464, 336); await page.evaluate(() => window.__bincovSample.driver.door('resident-west', true)); await settle();
      const staged = await page.evaluate(() => {
        const h = window.__bincovSample.host, a = h.lastBatch.frame.actors.find(a => a.kind !== 'player' && a.alive && Math.hypot(a.x - 432, a.y - 336) > 120);
        if (!a) throw new Error('no live enemy away from the doorway');
        window.__bincovSample.driver.placeEnemy(a.uid, { x: 432, y: 336 }); return { uid: a.uid, home: { x: a.x, y: a.y } };
      });
      try {
        await settle();
        const result = await page.evaluate(uid => {
          const h = window.__bincovSample.host, v = h.view, b = h.lastBatch, guide = v.doorGuides.get('resident-west'), g = v.actors.get(uid);
          h.app.ticker.stop();
          try {
            v.time = 1; v.shake = 0;
            const probe = x => ({ ...b, events: [], frame: { ...b.frame, bullets: [...b.frame.bullets, { uid: 'probe-doorway', x, y: 348, vx: -300, vy: 0, enemy: true, owner: uid }] } });
            v.present(probe(442), 0); v.present(probe(432), 0);
            const parts = { enemy: window.__figure(g), bullet: [v.bullets.get('probe-doorway').g] }, guideShown = guide.visible;
            const shown = Object.fromEntries(Object.entries(parts).map(([k, list]) => [k, list.map(s => s.visible)]));
            const read = () => { v.render(); return h.app.renderer.extract.pixels({ target: v.worldRT }).pixels.slice(); };
            const measure = key => {
              const shots = {};
              for (const [name, entity, guided] of [['A', true, true], ['B', false, true], ['C', true, false], ['D', false, false]]) {
                for (const [k, list] of Object.entries(parts)) list.forEach((s, i) => { s.visible = k === key && entity && shown[k][i]; });
                guide.visible = guided; shots[name] = read();
              }
              return window.__occlusion(shots);
            };
            const result = { door: !!b.frame.doors['resident-west'], guideShown, guideAlpha: guide.alpha, enemyShown: shown.enemy[0], bulletShown: shown.bullet[0],
              enemy: measure('enemy'), bullet: measure('bullet') };
            for (const [k, list] of Object.entries(parts)) list.forEach((s, i) => { s.visible = shown[k][i]; });
            guide.visible = guideShown;
            return result;
          } finally { v.render(); h.app.render(); h.app.ticker.start(); }
        }, staged.uid);
        await frames(3); await resumeStall();
        const clip = await page.evaluate(() => { const v = window.__bincovSample.host.view, a = v.worldToClient({ x: 400, y: 280 }), b = v.worldToClient({ x: 464, y: 360 });
          return { x: Math.round(a.x), y: Math.round(a.y), width: Math.round(b.x - a.x), height: Math.round(b.y - a.y) }; });
        await page.screenshot({ path: resolve(out, `${size.join('x')}-S03b-doorway-crop.png`), clip });
        (report.occlusion ??= []).push({ size: size.join('x'), check: 'S03b', ...result }); // kept on failure too
        assert.equal(result.door, true, 'the west door is open');
        assert.ok(result.enemyShown && result.bulletShown, 'the enemy and the probe bullet are drawn');
        for (const [name, r, min] of [['enemy', result.enemy, 100], ['bullet', result.bullet, 4]]) {
          assert.ok(r.body > min, `positive control: the ${name} is drawn (${r.body} px)`);
          assert.ok(r.guide > 50, `positive control: the guide, when drawn, is in the doorway (${r.guide} px)`);
          // Without this the check could pass because nothing sits on the guide.
          assert.ok(r.overlap > Math.min(20, min), `positive control: the ${name} sits on the guide (${r.overlap} px)`);
        }
        // The original drew the guide under them. The 2.5D guide is drawn above the actors (it shows through walls), so it
        // steps aside instead: no enemy or bullet pixel is covered because the guide is not drawn while they are on it.
        uncovered('door-guide-over-actors', result.guideShown ? Math.max(result.enemy.covered, result.bullet.covered) : 0, 'the door guide over the enemy and the bullet in a visible open doorway');
        assert.equal(result.guideShown, false, 'the door guide steps aside while the enemy and the bullet are on it');
        // The bullet alone: the guide hides only for the frames its trail is on the guide, and is back once nothing is.
        await page.evaluate(({ uid, home }) => window.__bincovSample.driver.placeEnemy(uid, home), staged); await settle();
        const alone = await page.evaluate(owner => {
          const h = window.__bincovSample.host, v = h.view, b = h.lastBatch, guide = v.doorGuides.get('resident-west');
          h.app.ticker.stop();
          try {
            const before = guide.visible, probe = x => ({ ...b, events: [], frame: { ...b.frame, bullets: [...b.frame.bullets, { uid: 'probe-alone', x, y: 348, vx: -300, vy: 0, enemy: true, owner }] } });
            v.present(probe(442), 0); v.present(probe(432), 0); const during = guide.visible;
            v.present({ ...b, events: [] }, 0); return { before, during, after: guide.visible };
          } finally { v.render(); h.app.render(); h.app.ticker.start(); }
        }, staged.uid);
        assert.deepEqual(alone, { before: true, during: false, after: true }, 'the guide hides only while the bullet is on it');
        return { ...result, alone };
      } finally {
        await page.evaluate(({ uid, home }) => { const d = window.__bincovSample.driver; d.placeEnemy(uid, home); d.door('resident-west', false); }, staged);
        await settle();
      }
    });
    await check('S03c stair-label-under-an-enemy-on-uncovered-floor', async () => {
      // Phaser P09 on the 2.5D view: a live enemy stands where the up-stair destination is drawn (the view's label box; the
      // text is HUD text above the canvas). Four page captures of the label and the enemy: A both, B label only, C enemy
      // only, D neither, toggling the enemy's sprites and the label element with the ticker stopped. P09's second part (the
      // label stays readable over a roof) has no 2.5D counterpart: HUD text always draws above the canvas.
      await place(464, 336); await settle();
      const staged = await page.evaluate(() => {
        const h = window.__bincovSample.host, v = h.view, el = [...document.querySelectorAll('.cs-stair')].find(e => !e.hidden && e.textContent === '上楼 · 二楼');
        if (!el) throw new Error('the up-stair destination is not shown');
        const r = el.getBoundingClientRect(), top = v.clientToWorld(r.left + r.width / 2, r.top), bottom = v.clientToWorld(r.left + r.width / 2, r.bottom);
        const a = h.lastBatch.frame.actors.find(a => a.kind !== 'player' && a.alive && Math.hypot(a.x - top.x, a.y - top.y) > 120);
        if (!a) throw new Error('no live enemy away from the stairs');
        // Feet just below the label: the drawn figure (about 48 px tall) spans the label's whole height.
        const at = { x: Math.round(top.x), y: Math.round(bottom.y) + 4 }, { x, y } = v.stairLabelViews().find(l => l.id === 'resident-up');
        window.__bincovSample.driver.placeEnemy(a.uid, at); return { uid: a.uid, home: { x: a.x, y: a.y }, at, label: { x, y } };
      });
      try {
        await settle();
        // Stop the ticker before measuring, so the camera, the canvas and the label element hold one frame for every capture.
        const clip = await page.evaluate(({ uid, at }) => {
          const h = window.__bincovSample.host, v = h.view, el = [...document.querySelectorAll('.cs-stair')].find(e => !e.hidden && e.textContent === '上楼 · 二楼');
          h.app.ticker.stop(); window.__figureShown = window.__figure(v.actors.get(uid)).map(s => s.visible);
          const r = el.getBoundingClientRect(), a = v.worldToClient({ x: at.x - 16, y: at.y - 56 }), b = v.worldToClient({ x: at.x + 16, y: at.y + 6 });
          const x = Math.floor(Math.min(r.left, a.x)) - 2, y = Math.floor(Math.min(r.top, a.y)) - 2, { x: lx, y: ly } = v.stairLabelViews().find(l => l.id === 'resident-up');
          return { x, y, width: Math.ceil(Math.max(r.right, b.x)) + 2 - x, height: Math.ceil(Math.max(r.bottom, b.y)) + 2 - y, shown: v.actorShown(uid), label: { x: lx, y: ly } };
        }, staged);
        const shots = {}, area = { x: clip.x, y: clip.y, width: clip.width, height: clip.height };
        try {
          for (const [name, enemy, label] of [['A', true, true], ['B', false, true], ['C', true, false], ['D', false, false]]) {
            await page.evaluate(([uid, enemy, label]) => {
              const h = window.__bincovSample.host, v = h.view, el = [...document.querySelectorAll('.cs-stair')].find(e => !e.hidden && e.textContent === '上楼 · 二楼');
              window.__figure(v.actors.get(uid)).forEach((s, i) => { s.visible = enemy && window.__figureShown[i]; }); el.style.visibility = label ? '' : 'hidden';
              v.render(); h.app.render();
            }, [staged.uid, enemy, label]);
            await frames(2); shots[name] = (await page.screenshot({ clip: area })).toString('base64');
            if (name === 'A') await page.screenshot({ path: resolve(out, `${size.join('x')}-S03c-label-crop.png`), clip: area });
          }
        } finally {
          await page.evaluate(uid => {
            const h = window.__bincovSample.host;
            window.__figure(h.view.actors.get(uid)).forEach((s, i) => { s.visible = window.__figureShown[i]; }); delete window.__figureShown;
            for (const el of document.querySelectorAll('.cs-stair')) el.style.visibility = '';
            h.view.render(); h.app.render(); h.app.ticker.start();
          }, staged.uid);
        }
        const result = await page.evaluate(`(async () => window.__occlusion({ A: await ${decode(shots.A)}, B: await ${decode(shots.B)}, C: await ${decode(shots.C)}, D: await ${decode(shots.D)} }))()`);
        const s = await page.evaluate(() => window.__bincovSample.host.view.view.s), scaled = n => Math.round(n * s * s);
        const detail = { at: staged.at, clip, scale: s, ...result };
        (report.occlusion ??= []).push({ size: size.join('x'), check: 'S03c', ...detail }); // kept on failure too
        assert.ok(clip.shown, 'the enemy on the uncovered hall floor is drawn');
        assert.deepEqual(clip.label, staged.label, 'the destination did not move for the enemy');
        assert.ok(result.body > scaled(100), `positive control: the enemy is in the capture (${result.body} px)`);
        assert.ok(result.guide > scaled(50), `positive control: the label is drawn in the capture (${result.guide} px)`);
        assert.ok(result.overlap > scaled(20), `positive control: the enemy sits on the label (${result.overlap} px, need > ${scaled(20)})`);
        uncovered('stair-label-over-actors', result.covered, 'the stair label over an enemy on uncovered floor');
        return detail;
      } finally {
        await page.evaluate(({ uid, home }) => window.__bincovSample.driver.placeEnemy(uid, home), staged);
        await settle();
      }
    });
    await check('S04 real-stairs-and-whole-current-floor', async () => {
      await place(560, 272); await settle(); await takeStairs('resident-f2'); await settle();
      const upstairs = await guides();
      // Continue through both actual transitions even when an old build is missing the new cues.
      await takeStairs('coast');
      await place(496, 272); await settle(); await takeStairs('resident-b1'); await settle();
      const basement = await guides();
      for (const floor of [upstairs, basement]) {
        assert.ok(floor.structures.filter(o => o.kind === 'ceiling').length >= 3);
        assert.ok(floor.structures.filter(o => o.kind === 'ceiling').every(o => o.level === 4 && !o.visible));
        const walls = floor.structures.filter(o => o.kind === 'wall' || o.kind === 'door'), south = Math.max(...walls.map(o => o.cell.y));
        assert.ok(walls.every(o => o.level === 0 && o.mode), 'every wall follows the indoor rule');
        assert.ok(walls.filter(o => o.cell.y === south).every(o => o.mode === 'base') && walls.filter(o => o.cell.y === 0).every(o => o.mode === 'full'));
        assert.ok(walls.filter(o => o.rule === 'row').every(o => o.mode === 'base'), 'the landing is north of the inner east-west run');
        assert.ok(floor.structures.filter(o => o.kind === 'lintel').every(o => !o.visible));
        assert.ok(floor.doors.every(d => d.visible)); assert.ok(floor.labels.every(e => e.visible));
        assert.ok(Object.values(floor.revealed).some(v => !v), 'structural cutaway must not reveal closed rooms');
      }
      return { upstairs, basement };
    });
    await check('S04b stair-label-clears-player-from-both-sides', async () => {
      const samples = [];
      for (const y of [272, 308, 336]) {
        await place(560, y); await settle();
        const sample = await page.evaluate(() => {
          const h = window.__bincovSample.host, p = h.lastBatch.frame.player;
          const entry = h.lastBatch.map.entries.find(e => e.kind === 'up'), label = h.view.stairLabels.get(entry.id);
          // The label the player sees is HUD text placed at the view's label box; check that element on screen too.
          const el = [...document.querySelectorAll('.cs-stair')].find(e => !e.hidden && e.textContent === entry.label), r = el?.getBoundingClientRect();
          const a = h.view.worldToClient({ x: p.x - 14, y: p.y - 44 }), b = h.view.worldToClient({ x: p.x + 14, y: p.y + 4 });
          return { player: { x: p.x, y: p.y }, label: { x: label.x - label.width / 2, y: label.y, w: label.width, h: label.height, visible: label.visible },
            hud: r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null, body: { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y } };
        });
        const p = sample.player, l = sample.label, hud = sample.hud, body = sample.body;
        assert.ok(l.visible, 'known stair destination remains visible');
        assert.ok(l.x + l.w <= p.x - 14 || l.x >= p.x + 14 || l.y + l.h <= p.y - 44 || l.y >= p.y + 4, 'stair destination must not cover the player');
        assert.ok(hud, 'the stair destination is shown on screen');
        assert.ok(hud.x + hud.w <= body.x || hud.x >= body.x + body.w || hud.y + hud.h <= body.y || hud.y >= body.y + body.h, `shown destination must not cover the player: ${JSON.stringify({ hud, body })}`);
        samples.push(sample);
      }
      return samples;
    });
    await check('S04c indoor-wall-rule-on-the-second-floor', async () => {
      // docs/INDOOR-WALL-VISIBILITY-PLAN.md on the floor of its marks, from the drawn pictures: the inner east-west run (row 3)
      // switches whole with the side of its centre line (y 112, buffer 4) the feet are on, keeps its mode while walked into
      // the buffer and starts there as base after a rebuild (a fixture placement is one); the south front shows only its cells; walls in front of a doorway are cut clear over it.
      const read = () => page.evaluate(() => {
        const v = window.__bincovSample.host.view, alpha = (o, y0, y1) => {
          const c = v.tex.canvas(o.shown ?? o.key), d = c.getContext('2d').getImageData(0, y0, c.width, y1 - y0).data;
          let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n;
        };
        const at = (x, y) => v.occluders.find(o => o.cell?.x === x && o.cell?.y === y);
        const piece = (x, y) => { const o = at(x, y), h = o.rect.h; return { mode: o.wall?.mode, level: o.level, drawn: o.sprite.texture === v.tex.atlas.get(o.shown ?? o.key),
          above: alpha(o, 0, h - 32), foot: alpha(o, h - 32, h) }; };
        return { player: v.last.player.y, rebuilds: v.stats.rebuilds, run: [7, 8, 9, 10].map(x => at(x, 3).wall?.mode), south: piece(5, 9), north: piece(5, 0), side: piece(0, 5), inner: piece(7, 4),
          door: piece(9, 3), front: piece(4, 6), cuts: at(4, 6).wall?.cut };
      });
      const steps = {};
      const go = async (name, y, map = 'resident-f2') => { await place(176, y, map); await settle(); steps[name] = await read(); };
      // Real movement up and down the corridor (x 176): stop as soon as the feet pass `y` going that way.
      const walk = async (name, key, y) => {
        await page.keyboard.down(key);
        try { await page.waitForFunction(([n, y]) => { const p = window.__bincovSample.host.lastBatch.frame.player.y; return n ? p <= y : p >= y; }, [key === 'w', y]); }
        finally { await page.keyboard.up(key); }
        await settle(); steps[name] = await read();
      };
      await go('corridor', 176);
      await page.screenshot({ path: resolve(out, `${size.join('x')}-S04c-corridor.png`) });
      await walk('buffer-from-south', 'w', 116); await walk('north', 'w', 103);
      await page.screenshot({ path: resolve(out, `${size.join('x')}-S04c-north-of-run.png`) });
      await walk('buffer-from-north', 's', 108); await walk('south-again', 's', 121);
      await place(464, 336); await settle(); await go('reload-in-buffer', 115);
      for (const k of ['buffer-from-south', 'buffer-from-north']) assert.ok(steps[k].player >= 108 && steps[k].player <= 116, `${k} stopped in the buffer: ${steps[k].player}`);
      assert.ok(steps.north.player < 108 && steps['south-again'].player > 116);
      assert.equal(new Set(['corridor', 'buffer-from-south', 'north', 'buffer-from-north', 'south-again'].map(k => steps[k].rebuilds)).size, 1, 'walking never rebuilds the scene');
      const run = Object.fromEntries(Object.entries(steps).map(([k, s]) => [k, s.run]));
      assert.deepEqual(run, { corridor: Array(4).fill('full'), 'buffer-from-south': Array(4).fill('full'), north: Array(4).fill('base'),
        'buffer-from-north': Array(4).fill('base'), 'south-again': Array(4).fill('full'), 'reload-in-buffer': Array(4).fill('base') });
      const { corridor: c, north: n } = steps;
      assert.ok(c.south.mode === 'base' && c.south.above === 0 && c.south.foot > 900 && c.south.drawn, `south front: footprint only ${JSON.stringify(c.south)}`);
      for (const w of [c.north, c.side, c.inner]) assert.ok(w.mode === 'full' && w.level === 0 && w.above > 1000 && w.drawn, `whole wall ${JSON.stringify(w)}`);
      assert.ok(c.door.mode === 'full' && c.door.above > 0, 'the storage door shows whole from the south');
      assert.ok(n.door.mode === 'base' && n.door.above === 0 && n.door.foot > 0 && n.door.drawn, `the storage door cut to its cell: ${JSON.stringify(n.door)}`);
      assert.deepEqual(c.cuts, [{ x: 0, y: 0, w: 32, h: 48 }]);
      assert.ok(c.front.mode === 'full' && c.front.above === 0 && c.front.foot > 0, `the wall south of the west door is cut over the doorway: ${JSON.stringify(c.front)}`);
      return steps;
    });
    await check('S05 hidden-room-zero-pixels-with-positive-control', async () => {
      await place(176, 176, 'resident-f2'); await settle();
      const living = await page.evaluate(() => {
        const h = window.__bincovSample.host, a = h.lastBatch.frame.actors.find(a => a.uid === 'enemy-0');
        return { alive: a.alive, revealed: h.lastBatch.frame.revealed[a.regionId], shown: h.view.actorShown(a.uid) };
      });
      assert.equal(living.alive, true); assert.equal(living.revealed, false); assert.equal(living.shown, false);
      await page.evaluate(() => { const d = window.__bincovSample.driver; d.placeEnemy('enemy-0', { x: 80, y: 208 }); d.kill('enemy-0'); }); await settle();
      const result = await page.evaluate(() => {
        const h = window.__bincovSample.host, v = h.view, b = h.lastBatch, before = JSON.stringify(b.frame.revealed);
        h.app.ticker.stop();
        try {
          v.time = 1; v.shake = 0; v.present({ ...b, events: [] }, 0);
          // Remove ceilings as a diagnostic on both builds: a pass must come from permissions, never an opaque roof.
          for (const o of v.occluders) if (o.kind === 'roof' || o.kind === 'ceiling') o.sprite.visible = false;
          const hidden = r => r !== null && b.frame.revealed[r] !== true, sprites = [];
          const counts = { actors: 0, loot: 0, containers: 0, decals: 0 };
          for (const a of b.frame.actors) if (hidden(a.regionId)) {
            const g = v.actors.get(a.uid); counts.actors++;
            for (const s of [g.body, g.weapon, g.flash, g.shadow, ...g.arms, g.rim, g.wrim, g.corpse, g.wade]) if (s) sprites.push(s);
          }
          for (const l of b.frame.loot) if (hidden(l.regionId)) { const s = v.loot.get(l.uid); if (s) { sprites.push(s); counts.loot++; } }
          for (const c of b.frame.containers) if (hidden(c.regionId)) { const g = v.crates.get(c.id); if (g) { sprites.push(g.s, g.shadow); counts.containers++; } }
          for (const d of v.fx.decals) if (hidden(d.region)) { sprites.push(d.s); counts.decals++; }
          const original = sprites.map(s => s.visible), capture = () => { v.render(); return h.app.renderer.extract.pixels({ target: v.worldRT }).pixels.slice(); };
          const normal = capture(); sprites.forEach(s => { s.visible = false; }); const stripped = capture();
          sprites.forEach(s => { s.visible = true; }); const leaked = capture();
          sprites.forEach((s, i) => { s.visible = original[i]; }); v.render(); h.app.render();
          const changed = other => { let n = 0; for (let i = 0; i < normal.length; i += 4) if (normal[i] !== other[i] || normal[i + 1] !== other[i + 1] || normal[i + 2] !== other[i + 2]) n++; return n; };
          return { counts, shownHiddenSprites: original.filter(Boolean).length, changed: changed(stripped), positiveChanged: changed(leaked),
            unchangedPermissions: before === JSON.stringify(b.frame.revealed), revealed: b.frame.revealed };
        } finally { h.app.ticker.start(); }
      });
      assert.ok(result.counts.actors >= 1 && result.counts.loot >= 1 && result.counts.decals >= 14);
      assert.equal(result.shownHiddenSprites, 0); assert.equal(result.changed, 0); assert.ok(result.positiveChanged > 10); assert.ok(result.unchangedPermissions);
      await place(80, 176, 'resident-f2'); await settle();
      assert.equal(await page.evaluate(() => window.__bincovSample.host.view.actorShown('enemy-0')), true, 'entering the room must reveal the same corpse');
      return { living, ...result };
    });
    await check('S06 exterior-restores-cover', async () => {
      await place(464, 448); await page.evaluate(() => window.__bincovSample.driver.door('resident-front', false)); await settle();
      const result = await guides(), roof = result.structures.find(o => o.kind === 'roof' && o.region?.endsWith('/resident-ground'));
      assert.ok(roof && roof.level === 0 && roof.visible); assert.ok(Object.values(result.revealed).every(v => !v));
      assert.deepEqual(result.doors.filter(d => d.visible).map(d => d.id), ['resident-front']);
      assert.ok(result.labels.every(e => !e.visible)); return { roof, doors: result.doors };
    });
    await context.close(); context = null;
  }
} finally { await context?.close(); await browser.close(); await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2)); }
