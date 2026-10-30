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
const touch = option('touch', '0') === '1';
const html = await readFile(option('html', 'dist/index.html'), 'utf8'), out = resolve(option('out', 'test-results/issue26-spatial'));
await mkdir(out, { recursive: true });
const browser = await chromium.launch(browserOptions);
const report = { sha256: createHash('sha256').update(html).digest('hex'), browser: browser.version(), touch, checks: [], errors: [] };
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
  if (touch && !name.startsWith('S03c ')) return;
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
/** Sprites an actor's figure is drawn with (its ground shadow stays: it lies under every guide by design). */
const FIGURE = 'g => [g.body, g.weapon, ...g.arms, g.flash, g.wade]';

try {
  for (size of touch ? [[932, 430]] : [[1280, 720], [1920, 1080]]) {
    context = await browser.newContext({ offline: true, viewport: { width: size[0], height: size[1] }, hasTouch: touch, isMobile: touch });
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
        assert.equal(result.guideShown ? Math.max(result.enemy.covered, result.bullet.covered) : 0, 0, 'the door guide over the enemy and the bullet in a visible open doorway');
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
      // Real Runtime placement and actual DOM label bounds. A is the normal collision frame; B forces the original label
      // with no enemy, C keeps only the enemy, D neither. B/C prove the overlap still exists even when A hides the label.
      await place(464, 336); await settle();
      await page.screenshot({ path: resolve(out, `${size.join('x')}-S03c-before.png`) });
      const staged = await page.evaluate(() => {
        const h = window.__bincovSample.host, v = h.view, el = [...document.querySelectorAll('.cs-stair')].find(e => !e.hidden && e.textContent === '上楼 · 二楼');
        if (!el) throw new Error('the up-stair destination is not shown');
        const r = el.getBoundingClientRect(), top = v.clientToWorld(r.left + r.width / 2, r.top), bottom = v.clientToWorld(r.left + r.width / 2, r.bottom);
        const a = h.lastBatch.frame.actors.find(a => a.kind !== 'player' && a.alive && Math.hypot(a.x - top.x, a.y - top.y) > 120);
        if (!a) throw new Error('no live enemy away from the stairs');
        // Feet just below the label: the drawn figure (about 48 px tall) spans the label's whole height.
        const at = { x: Math.round(top.x), y: Math.round(bottom.y) + 4 }, { x, y } = v.stairLabelViews().find(l => l.id === 'resident-up');
        window.__bincovSample.driver.placeEnemy(a.uid, at); return { uid: a.uid, home: { x: a.x, y: a.y }, at, label: { x, y }, before: { hidden: el.hidden, width: r.width, height: r.height } };
      });
      try {
        await settle();
        // Stop the ticker before measuring, so the camera, the canvas and the label element hold one frame for every capture.
        const clip = await page.evaluate(({ uid, at }) => {
          const h = window.__bincovSample.host, v = h.view, el = [...document.querySelectorAll('.cs-stair')].find(e => e.textContent === '上楼 · 二楼');
          h.app.ticker.stop(); window.__figureShown = window.__figure(v.actors.get(uid)).map(s => s.visible);
          const hidden = el.hidden; el.hidden = false;
          const r = el.getBoundingClientRect(), a = v.worldToClient({ x: at.x - 16, y: at.y - 56 }), b = v.worldToClient({ x: at.x + 16, y: at.y + 6 });
          const x = Math.floor(Math.min(r.left, a.x)) - 2, y = Math.floor(Math.min(r.top, a.y)) - 2, { x: lx, y: ly } = v.stairLabelViews().find(l => l.id === 'resident-up');
          el.hidden = hidden;
          return { x, y, width: Math.ceil(Math.max(r.right, b.x)) + 2 - x, height: Math.ceil(Math.max(r.bottom, b.y)) + 2 - y, shown: v.actorShown(uid), hidden, label: { x: lx, y: ly } };
        }, staged);
        const shots = {}, area = { x: clip.x, y: clip.y, width: clip.width, height: clip.height };
        try {
          for (const [name, enemy, label] of [['A', true, !clip.hidden], ['B', false, true], ['C', true, false], ['D', false, false]]) {
            await page.evaluate(([uid, enemy, label]) => {
              const h = window.__bincovSample.host, v = h.view, el = [...document.querySelectorAll('.cs-stair')].find(e => e.textContent === '上楼 · 二楼');
              window.__figure(v.actors.get(uid)).forEach((s, i) => { s.visible = enemy && window.__figureShown[i]; }); el.hidden = !label;
              v.render(); h.app.render();
            }, [staged.uid, enemy, label]);
            await frames(2); shots[name] = (await page.screenshot({ clip: area })).toString('base64');
            if (name === 'A') {
              await page.screenshot({ path: resolve(out, `${size.join('x')}-S03c-label-crop.png`), clip: area });
              await page.screenshot({ path: resolve(out, `${size.join('x')}-S03c-during.png`) });
            }
          }
        } finally {
          await page.evaluate(uid => {
            const h = window.__bincovSample.host;
            window.__figure(h.view.actors.get(uid)).forEach((s, i) => { s.visible = window.__figureShown[i]; }); delete window.__figureShown;
            h.stairNames(h.lastBatch.frame);
            h.view.render(); h.app.render(); h.app.ticker.start();
          }, staged.uid);
        }
        const result = await page.evaluate(`(async () => window.__occlusion({ A: await ${decode(shots.A)}, B: await ${decode(shots.B)}, C: await ${decode(shots.C)}, D: await ${decode(shots.D)} }))()`);
        const s = await page.evaluate(() => window.__bincovSample.host.view.view.s), scaled = n => Math.round(n * s * s);
        const permissions = await page.evaluate(uid => {
          const h = window.__bincovSample.host, v = h.view, b = h.lastBatch, original = JSON.stringify(b.frame.revealed);
          h.app.ticker.stop();
          const label = () => [...document.querySelectorAll('.cs-stair')].find(e => e.textContent === '上楼 · 二楼');
          const actor = b.frame.actors.find(a => a.uid === uid);
          if (!actor.regionId || b.frame.revealed[actor.regionId] !== true) throw new Error('overlap actor must be in a revealed region');
          const probe = frame => { v.present({ ...b, events: [], frame }, 0); h.stairNames(frame); return { hidden: label().hidden, shown: v.actorShown(uid) }; };
          try {
            // Same coordinates, real region permission withheld; then the same actor outside the viewport or absent from
            // this floor's frame. These presentation-only probes never alter Runtime permissions or the saved raid.
            const hidden = probe({ ...b.frame, revealed: { ...b.frame.revealed, [actor.regionId]: false } });
            const offscreen = probe({ ...b.frame, actors: b.frame.actors.map(a => a.uid === uid ? { ...a, x: -10000, y: -10000 } : a) });
            const absent = probe({ ...b.frame, actors: b.frame.actors.filter(a => a.uid !== uid) });
            const visible = probe(b.frame);
            return { hidden, offscreen, absent, visible, unchangedPermissions: original === JSON.stringify(h.lastBatch.frame.revealed) };
          } finally { v.present({ ...b, events: [] }, 0); h.stairNames(b.frame); h.app.render(); h.app.ticker.start(); }
        }, staged.uid);
        const detail = { at: staged.at, before: staged.before, clip, scale: s, permissions, ...result };
        (report.occlusion ??= []).push({ size: size.join('x'), check: 'S03c', ...detail }); // kept on failure too
        assert.ok(clip.shown, 'the enemy on the uncovered hall floor is drawn');
        assert.deepEqual(clip.label, staged.label, 'the destination did not move for the enemy');
        assert.ok(result.body > scaled(100), `positive control: the enemy is in the capture (${result.body} px)`);
        assert.ok(result.guide > scaled(50), `positive control: the label is drawn in the capture (${result.guide} px)`);
        assert.ok(result.overlap > scaled(20), `positive control: the enemy sits on the label (${result.overlap} px, need > ${scaled(20)})`);
        assert.equal(result.covered, 0, `the stair label over an enemy on uncovered floor: ${result.covered} covered pixels`);
        assert.equal(staged.before.hidden, false, 'destination is readable before collision');
        assert.equal(clip.hidden, true, 'destination hides only during collision');
        assert.deepEqual(permissions.hidden, { hidden: false, shown: false }, 'unrevealed enemy at the same position cannot hide the destination');
        assert.equal(permissions.offscreen.hidden, false, 'offscreen enemy cannot hide the destination');
        assert.deepEqual(permissions.absent, { hidden: false, shown: false }, 'enemy absent from this floor cannot hide the destination');
        assert.deepEqual(permissions.visible, { hidden: true, shown: true }, 'restoring the same visible body restores collision');
        assert.ok(permissions.unchangedPermissions, 'view probes never change Runtime revelation');
        await page.evaluate(({ uid, home }) => window.__bincovSample.driver.placeEnemy(uid, home), staged); await settle();
        detail.after = await page.evaluate(() => {
          const el = [...document.querySelectorAll('.cs-stair')].find(e => e.textContent === '上楼 · 二楼');
          return { hidden: el.hidden, width: el.getBoundingClientRect().width };
        });
        await page.screenshot({ path: resolve(out, `${size.join('x')}-S03c-after.png`) });
        assert.ok(!detail.after.hidden && detail.after.width > 0, 'destination returns after the enemy leaves');
        return detail;
      } finally {
        await page.evaluate(({ uid, home }) => window.__bincovSample.driver.placeEnemy(uid, home), staged);
        await settle();
      }
    });
    await check('S03d faced-door-glow-and-way-through', async () => {
      // #26 F07: the door the E prompt is about glows (only where the door itself is drawn, at the door's depth) and the way
      // through it is marked on the floor under the actors, barred while closed. Reads of the world target with the ticker
      // stopped, toggling one sprite at a time, as in S03b.
      const cue = () => page.evaluate(() => {
        const h = window.__bincovSample.host, v = h.view, b = h.lastBatch, t = b.frame.interaction, c = v.facedDoor;
        return { faced: t?.kind === 'door' ? t.ref.id : null, glow: !!c?.glow.visible, way: !!c?.way.visible,
          wayAt: c && [c.way.x, c.way.y, c.way.texture.width, c.way.texture.height], wayUnder: c?.way.parent === v.flat,
          glowDepth: c && c.glow.parent === v.sorted && c.glow.zIndex - v.doors.get(t?.ref.id)?.z };
      });
      const pixels = () => page.evaluate(() => {
        const h = window.__bincovSample.host, v = h.view, c = v.facedDoor, door = v.doors.get(h.lastBatch.frame.interaction.ref.id).sprite;
        h.app.ticker.stop();
        try {
          v.time = 0; const shown = [c.glow.visible, c.way.visible, door.visible];
          const read = (glow, way, d) => { c.glow.visible = glow; c.way.visible = way; door.visible = d; v.render(); return h.app.renderer.extract.pixels({ target: v.worldRT }).pixels.slice(); };
          const all = read(true, true, true), noGlow = read(false, true, true), noWay = read(true, false, true), bare = read(false, false, true), noDoor = read(false, false, false);
          [c.glow.visible, c.way.visible, door.visible] = shown;
          const differs = (x, y, i) => x[i] !== y[i] || x[i + 1] !== y[i + 1] || x[i + 2] !== y[i + 2];
          let glow = 0, glowOffDoor = 0, way = 0;
          for (let i = 0; i < all.length; i += 4) {
            if (differs(all, noGlow, i)) { glow++; if (!differs(bare, noDoor, i)) glowOffDoor++; }
            if (differs(all, noWay, i)) way++;
          }
          return { glow, glowOffDoor, way };
        } finally { v.render(); h.app.render(); h.app.ticker.start(); }
      });
      await page.evaluate(() => { const d = window.__bincovSample.driver; for (const id of ['resident-front', 'resident-west', 'resident-east']) d.door(id, false); });
      await page.evaluate(() => window.__bincovSample.driver.placePlayer({ x: 464, y: 336 }, Math.PI, 'coast')); await settle();
      const closed = { ...await cue(), pixels: await pixels() };
      assert.equal(closed.faced, 'resident-west', 'the prompt is about the west door');
      assert.ok(closed.glow && closed.way, 'the faced closed door glows and shows its way through');
      assert.deepEqual(closed.wayAt, [12 * 32, 10 * 32, 96, 32], 'the way runs east-west across the north-south wall, one cell either side');
      assert.ok(closed.wayUnder, 'the way lies on the floor layer, under walls and actors');
      assert.ok(closed.glowDepth > 0 && closed.glowDepth < .1, 'the glow is drawn right above the door, so actors in front stay on top');
      assert.ok(closed.pixels.glow > 100 && closed.pixels.way > 100, `positive controls: glow ${closed.pixels.glow} px, way ${closed.pixels.way} px`);
      assert.equal(closed.pixels.glowOffDoor, 0, 'the glow lights only pixels where the door itself is drawn');
      const before = await page.evaluate(() => window.__bincovSample.host.view.facedDoor.way.texture);
      await page.keyboard.press('e'); await page.waitForFunction(() => window.__bincovSample.host.lastBatch.frame.doors['resident-west']); await settle();
      const open = await cue();
      assert.ok(open.faced === 'resident-west' && open.glow && open.way, 'still marked once open');
      assert.ok(await page.evaluate(t => window.__bincovSample.host.view.facedDoor.way.texture !== t, before), 'the open way is drawn without the bar');
      // An enemy in the open doorway stands on the way: none of its pixels may be covered by it (the S03b reads).
      const staged = await page.evaluate(() => {
        const h = window.__bincovSample.host, a = h.lastBatch.frame.actors.find(a => a.kind !== 'player' && a.alive && Math.hypot(a.x - 432, a.y - 336) > 120);
        if (!a) throw new Error('no live enemy away from the doorway');
        window.__bincovSample.driver.placeEnemy(a.uid, { x: 432, y: 340 }); return { uid: a.uid, home: { x: a.x, y: a.y } };
      });
      try {
        await settle();
        const enemy = await page.evaluate(uid => {
          const h = window.__bincovSample.host, v = h.view, c = v.facedDoor, parts = window.__figure(v.actors.get(uid));
          h.app.ticker.stop();
          try {
            v.time = 0; const shown = parts.map(s => s.visible), way = c.way.visible, glow = c.glow.visible, shots = {};
            const read = () => { v.render(); return h.app.renderer.extract.pixels({ target: v.worldRT }).pixels.slice(); };
            for (const [name, entity, marked] of [['A', true, true], ['B', false, true], ['C', true, false], ['D', false, false]]) {
              parts.forEach((s, i) => { s.visible = entity && shown[i]; }); c.way.visible = c.glow.visible = marked; shots[name] = read();
            }
            parts.forEach((s, i) => { s.visible = shown[i]; }); c.way.visible = way; c.glow.visible = glow;
            return { faced: h.lastBatch.frame.interaction?.ref.id, enemyShown: shown[0], ...window.__occlusion(shots) };
          } finally { v.render(); h.app.render(); h.app.ticker.start(); }
        }, staged.uid);
        assert.ok(enemy.enemyShown && enemy.body > 100, `positive control: the enemy is drawn (${enemy.body} px)`);
        assert.ok(enemy.overlap > 20, `positive control: the enemy stands on the marks (${enemy.overlap} px)`);
        assert.equal(enemy.covered, 0, 'no enemy pixel is covered by the glow or the way');
        await place(208, 1232); await settle();
        const away = await cue();
        assert.ok(away.faced !== 'resident-west' && !away.glow && !away.way, 'the marks go once no door is faced');
        return { closed, open, enemy, away };
      } finally {
        await page.evaluate(({ uid, home }) => { const d = window.__bincovSample.driver; d.placeEnemy(uid, home); d.door('resident-west', false); }, staged);
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
      // Read once every wall has sunk or risen to its mode (0.2 s after a switch).
      const read = async () => { await page.waitForFunction(() => window.__bincovSample.host.view.occluders.every(o => !o.wall || o.wall.sunk === (o.wall.mode === 'base' ? 1 : 0)), null, { timeout: 10000 }); return page.evaluate(() => {
        const v = window.__bincovSample.host.view, alpha = (o, y0, y1) => {
          const c = v.tex.canvas(o.shown ?? o.key), d = c.getContext('2d').getImageData(0, y0, c.width, y1 - y0).data;
          let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n;
        };
        const at = (x, y) => v.occluders.find(o => o.cell?.x === x && o.cell?.y === y);
        const piece = (x, y) => { const o = at(x, y), h = o.rect.h; return { mode: o.wall?.mode, level: o.level, drawn: o.sprite.texture === v.tex.atlas.get(o.shown ?? o.key) && o.sprite.y === o.rect.y,
          above: alpha(o, 0, h - 32), foot: alpha(o, h - 32, h) }; };
        return { player: v.last.player.y, rebuilds: v.stats.rebuilds, run: [7, 8, 9, 10].map(x => at(x, 3).wall?.mode), south: piece(5, 9), north: piece(5, 0), side: piece(0, 5), inner: piece(7, 4),
          door: piece(9, 3), front: piece(4, 6), cuts: at(4, 6).wall?.cut };
      }); };
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
    await check('S04d walking-out-and-back-in-moves-the-south-front', async () => {
      // Real walks through the open front door (a fixture placement rebuilds the scene and switches outright): leaving, the
      // south front, on its cells while inside, rises back whole over 0.2 s, then the fades take it again; coming back
      // in it sinks to its cells the same way. One frame between is caught each way: lowered whole px, drawn down to the
      // south edge of its cells and no further.
      await place(464, 448); await settle();
      const door = await page.evaluate(() => { const d = window.__bincovSample.host.lastBatch.map.doors.find(d => d.id === 'resident-front'); return { x: d.x, y: d.y }; });
      await place(door.x * 32 + 16, (door.y - 2) * 32 + 16); await page.evaluate(() => window.__bincovSample.driver.door('resident-front', true)); await settle();
      const front = () => page.evaluate(y => {
        const v = window.__bincovSample.host.view;
        return v.occluders.filter(o => o.cell?.y === y && ['wall', 'door'].includes(o.kind)).map(o => ({ x: o.cell.x, mode: o.wall?.mode ?? null, sunk: o.wall?.sunk ?? null, level: o.level, home: o.sprite.y === o.rect.y, visible: o.sprite.visible }));
      }, door.y);
      const between = () => page.waitForFunction(y => {
        const v = window.__bincovSample.host.view, run = v.occluders.filter(o => o.cell?.y === y && o.wall && o.wall.mode !== 'hidden');
        return run.some(o => o.wall.sunk > 0 && o.wall.sunk < 1) && run.filter(o => o.wall.sunk > 0 && o.wall.sunk < 1)
          .map(o => ({ x: o.cell.x, sunk: o.wall.sunk, dy: o.sprite.y - o.rect.y, bottom: o.sprite.y + o.sprite.texture.height - o.rect.y - o.rect.h, rising: v.rising.includes(o) }));
      }, door.y, { polling: 'raf', timeout: 10000 }).then(r => r.jsonValue());
      const walk = async (key, y) => {
        const watch = between(); let mid;
        await page.keyboard.down(key);
        try { mid = await watch; await page.waitForFunction(([n, y]) => { const p = window.__bincovSample.host.lastBatch.frame.player.y; return n ? p <= y : p >= y; }, [key === 'w', y]); }
        finally { await page.keyboard.up(key); }
        await settle(); await page.waitForFunction(() => !window.__bincovSample.host.view.rising.length, null, { timeout: 10000 });
        return mid;
      };
      // The row also holds walls of other buildings: only this one's pieces (under the rule while inside) are followed.
      const inside = (await front()).filter(p => p.mode), ours = new Set(inside.map(p => p.x)), own = list => list.filter(p => ours.has(p.x));
      const leaving = await walk('s', (door.y + 1) * 32 + 40), outside = own(await front());
      const entering = await walk('w', (door.y - 1) * 32 + 16), again = own(await front());
      assert.ok(inside.length >= 5 && inside.every(p => p.mode === 'base' && p.sunk === 1 && p.home), `inside: the south front on its cells ${JSON.stringify(inside)}`);
      assert.ok(leaving.every(p => p.rising && p.dy > 0 && p.bottom === 0), `leaving: rising, drawn down to its cells' edge ${JSON.stringify(leaving)}`);
      assert.equal(new Set(leaving.map(p => p.sunk)).size, 1, 'the front rises as one');
      assert.ok(outside.every(p => p.mode === null && p.level >= 0 && p.home && p.visible), `outside: the fades have it back, standing where it was built ${JSON.stringify(outside)}`);
      assert.ok(entering.every(p => !p.rising && p.dy > 0 && p.bottom === 0), `coming in: sinking ${JSON.stringify(entering)}`);
      assert.ok(again.every(p => p.mode === 'base' && p.sunk === 1 && p.home), `inside again ${JSON.stringify(again)}`);
      return { door, leaving: leaving.map(p => `${p.x}:${p.dy}`), entering: entering.map(p => `${p.x}:${p.dy}`) };
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
