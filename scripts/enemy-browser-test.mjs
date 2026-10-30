/** Actual offline v8 saves in the shipped 2.5D host. Extra roles are saved fixtures, not native encounter claims. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { browserOptions } from './browser-options.mjs';
import { raidReady, drive, frames } from './raid-view.mjs';
import { resumeStalls } from './stall-resume.mjs';
import { createSessionState, SaveSession } from '../src/session.ts';
import { decodeSession, SESSION_KEY } from '../src/recovery-store.ts';
import { BUILDING_WORLD } from '../src/building-world.ts';
import { corridor, traversable } from '../src/spatial.ts';
import { actorArchetype, archetype, initialTactics } from '../src/enemy-archetypes.ts';
import { damageLayerEnemy } from '../src/layer-transition.ts';
import { ENEMY_CATALOG } from './enemy-catalog-data.ts';
import { MARKET_RAIDERS, MARKET_STORES } from '../src/enemy-posts.ts';
import { FAUNA_SITES, FAUNA_SQUAD } from '../src/enemy-fauna.ts';
import { AFFECTED_SQUAD } from '../src/enemy-affected.ts';
import { RECOVERY_SQUAD, RECOVERY_POSTS, RECOVERY_PICKUP } from '../src/enemy-recovery.ts';
import { BLOCKADE_SQUAD, BLOCKADE_WAIT_POINT } from '../src/enemy-blockade.ts';
import { runMallEnemyCases } from './enemy-mall-browser.mjs';
import { completeEnemyUnit, createEnemyCoverage, enemyReportPath, enemySelection, validateEnemyCoverage } from './enemy-browser-plan.mjs';

const selection = enemySelection(process.argv.slice(2));
const reportPath = resolve(enemyReportPath(selection.shard)), out = resolve(reportPath, '..');
await mkdir(out, { recursive: true });
const identity = { runId: process.env.GITHUB_RUN_ID ?? null, runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null, commit: process.env.GITHUB_SHA ?? null };
const coverage = createEnemyCoverage(selection, identity);
const artRoles = ENEMY_CATALOG.filter(card => card.assets.status === 'body-and-corpse').map(card => card.id);
const motionRoles = ['tidal-crab', 'saltback-dog', 'sac-spitter', 'salt-dazed', 'tide-chaser', 'salt-hulk'];
const report = { scope: 'All eighteen roles deploy natively in bounded street variants: first three, seed mod 5 = 0 boss, mod 5 = 1 fauna, mod 15 = 2 affected, mod 5 = 3 recovery with one existing cargo, mod 5 = 4 checkpoint with atomic registration and a real marked passage. Phase/art fixtures remain separate from ordinary deployment evidence.', screenshots: [], cases: [], errors: [], external: [], status: 'RUNNING', coverage };
function fixture(phase, role = 'raider-gunner') {
    const data = new Map(), state = createSessionState();
    const saves = new SaveSession(state, () => ({ getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) }));
    assert.ok(saves.initialize(), state.storageError); state.state = 'hideout'; assert.ok(saves.beginRun(42, true), state.storageError);
    const raid = state.expansion.raid, spec = archetype(role);
    const e = raid.maps.coast.enemies.find(e => e.id === role) ?? raid.maps.coast.enemies.find(e => e.id === 'raider-gunner');
    if (e.id !== role) {
        e.id = role; e.hp = spec.hp; e.tactics = initialTactics(role, 'art-review');
        raid.roster.find(r => r.uid === e.uid).id = role;
    }
    // These authored phase/art fixtures exercise the historical controller's full telegraph times. Native encounter
    // cases below retain #152 gun rules; their own saved phases/ammunition are observed without restocking.
    delete e.tactics.ballistics;
    Object.assign(e.tactics, { magazine: spec.magazine, reserve: spec.reserve });
    const context = { definition: BUILDING_WORLD.maps.coast, doors: raid.maps.coast.doors, highTide: raid.highTide };
    const p = [0, Math.PI / 2, Math.PI, -Math.PI / 2].map(a => ({ x: e.x + Math.cos(a) * 96, y: e.y + Math.sin(a) * 96 }))
        .find(p => traversable(context, p, 'body', 10) && corridor(context, e, p, 'sight'));
    assert.ok(p, 'a visible, safe observation point');
    raid.player = { ...p, rotation: Math.atan2(e.y - p.y, e.x - p.x) };
    if (phase === 'parley') {
        for (const actor of raid.maps.coast.enemies.filter(a => a.tactics)) {
            actor.id = 'blockade-sentry'; actor.hp = 85; actor.tactics = initialTactics(actor.id, 'guard-test');
            raid.roster.find(r => r.uid === actor.uid).id = actor.id;
        }
    } else if (phase === 'corpse') damageLayerEnemy(state.expansion, 'coast', e, e.hp * 2);
    else Object.assign(e.tactics, { phase, phaseLeft: phase === 'windup' ? archetype(role).windup / 2 : phase === 'reload' ? 1.8 : .4,
        lockedAim: Math.atan2(p.y - e.y, p.x - e.x), magazine: Math.min(1, spec.magazine), reserve: Math.min(4, spec.reserve), stance: 'hostile', awareness: 1,
        memory: { at: p, time: 0, source: 'sight', target: 'player' } });
    assert.ok(saves.persist(), `${role}/${phase}: ${state.storageError}`);
    const raw = data.get(SESSION_KEY); decodeSession(raw);
    return { raw, uid: e.uid };
}
const browser = await chromium.launch(browserOptions);
try {
    for (const viewport of selection.viewports) {
        const touch = viewport.width < 1000;
        const context = await browser.newContext({ viewport, offline: true, hasTouch: touch, isMobile: touch }); await resumeStalls(context);
        const scenarios = (touch ? ['parley'] : ['windup', 'reload', 'recovery', 'parley']).map(phase => ({ phase, role: 'raider-gunner', name: phase }));
        for (const role of artRoles) {
            if (touch || role !== 'raider-gunner') scenarios.push({ phase: 'windup', role, name: `${role}-windup` });
            if (!touch) scenarios.push({ phase: 'corpse', role, name: `${role}-corpse` });
        }
        for (const { phase, role, name } of scenarios) {
            const saved = fixture(phase, role);
            // A previous host can autosave between a storage write and navigation. Close each case first,
            // then install the next save before application startup, without another live writer.
            const page = await context.newPage(); page.setDefaultTimeout(60000);
            await page.addInitScript(([key, raw]) => localStorage.setItem(key, raw), [SESSION_KEY, saved.raw]);
            page.on('pageerror', e => report.errors.push(String(e))); page.on('request', r => { if (/^https?:/.test(r.url())) report.external.push(r.url()); });
            await page.goto(pathToFileURL(resolve('dist/index.html')).href + '?test=1&entry=tabs&freezeAI=1', { waitUntil: 'load' });
            await page.locator('[data-action="enter"]').click(); await raidReady(page);
            await drive(page, 'freezeAI', true);
            const resume = page.locator('.coast-sample [data-do="resume"]');
            if (await resume.isVisible()) await resume.click();
            await frames(page, 20);
            const actual = await page.evaluate(uid => {
                const h = window.__bincovSample.host, actor = h.lastBatch.frame.actors.find(a => a.uid === uid), gfx = h.view.actors.get(uid);
                const variant = actor.tactics.archetype;
                const bodyArt = Array.from({ length: 5 }, (_, f) => h.view.tex.actor(actor.kind, gfx.dir, f, variant)).includes(gfx.body.texture);
                const corpseArt = !actor.alive && [1, -1].some(face => h.view.tex.corpse(actor.kind, face, variant) === gfx.corpse?.texture);
                const held = h.view.tex.weapon(actor.weapon, actor.kind, variant);
                return { phase: actor.tactics.phase, reloading: !!actor.state.reloading, cue: gfx.telegraph.visible, boundary: actor.tactics.boundary,
                    bodyArt, corpseArt, artStyle: h.view.tex.actorStyle(actor.kind, variant),
                    bodyPose: { x: gfx.body.scale.x, y: gfx.body.scale.y, tilt: gfx.body.rotation },
                    heldWidth: held.canvas.width, heldArt: gfx.weapon.texture === held.texture, hands: gfx.arms.filter(a => a.visible).length,
                    weapon: actor.weapon, record: (({ version, enemyBackup }) => ({ version, enemyRules: enemyBackup !== undefined }))(JSON.parse(localStorage.getItem('escape-bincov.session.v2'))) };
            }, saved.uid);
            assert.equal(actual.phase, ['parley', 'corpse'].includes(phase) ? 'idle' : phase, `${viewport.width}/${name}: saved phase survives mount`);
            if (phase !== 'corpse') assert.ok(actual.cue);
            assert.equal(actual.reloading, phase === 'reload');
            // Record v9 (gun instances, footprints that follow the magazine) with enemy rules on, which the record says by holding enemyBackup.
            assert.equal(actual.weapon, phase === 'parley' ? 'rifle' : archetype(role).weapon); assert.deepEqual(actual.record, { version: 9, enemyRules: true });
            if (phase !== 'parley') {
                assert.equal(actual.artStyle, role); assert.ok(phase === 'corpse' ? actual.corpseArt : actual.bodyArt);
            }
            if (role === 'tide-ritualist' && phase === 'windup') {
                assert.ok(actual.heldArt && actual.heldWidth >= 40, 'ritualist visibly carries the long fishing tool');
                assert.equal(actual.hands, 2, 'both hands grip the polearm');
            }
            if (motionRoles.includes(role) && phase === 'windup') {
                assert.notDeepEqual(actual.bodyPose, { x: 1, y: 1, tilt: 0 }, 'preparation is visible on the body');
                if (viewport.width === 1280) {
                    const motion = await page.evaluate(uid => {
                        const h = window.__bincovSample.host, v = h.view, original = h.lastBatch, gfx = v.actors.get(uid);
                        const pose = () => ({ x: gfx.body.scale.x, y: gfx.body.scale.y, tilt: gfx.body.rotation });
                        const shown = phase => {
                            const copy = structuredClone(original), a = copy.frame.actors.find(a => a.uid === uid);
                            Object.assign(a.tactics, { phase, left: phase === 'recovery' ? .1 : .3, total: 1 });
                            v.present({ ...copy, events: [] }, 0); return pose();
                        };
                        const release = shown('release'), recovered = shown('recovery');
                        const reduced = v.opts.reducedMotion; v.opts.reducedMotion = true;
                        v.present({ ...original, events: [] }, 0);
                        const accessible = { pose: pose(), telegraph: gfx.telegraph.visible };
                        v.opts.reducedMotion = reduced; v.present({ ...original, events: [] }, 0);
                        return { release, recovered, accessible };
                    }, saved.uid);
                    assert.notDeepEqual(motion.release, actual.bodyPose);
                    assert.deepEqual(motion.recovered, { x: 1, y: 1, tilt: 0 });
                    assert.deepEqual(motion.accessible, { pose: { x: 1, y: 1, tilt: 0 }, telegraph: true });
                    report.cases.push({ viewport, scenario: `${role}-motion-contract`, ...motion });
                }
            }
            if (phase === 'parley') {
                assert.equal(actual.boundary.radius, 90);
                if (touch) await page.getByRole('button', { name: '询问 · 检查哨兵', exact: true }).tap();
                else await page.keyboard.press('e');
                await frames(page, 10);
                const result = await page.evaluate(uid => {
                    const h = window.__bincovSample.host;
                    return { notices: h.eventLog.filter(e => e.type === 'notice').map(e => e.detail.text),
                        stance: h.lastBatch.frame.actors.find(a => a.uid === uid).tactics.stance };
                }, saved.uid);
                assert.ok(result.notices.some(text => text.includes('外围公共通道')), JSON.stringify(result));
                assert.equal(result.stance, 'idle');
            }
            const file = `${viewport.width}x${viewport.height}-${name}.png`;
            await page.screenshot({ path: resolve(out, file) }); report.screenshots.push(file); report.cases.push({ viewport, scenario: name, ...actual });
            if (viewport.width === 1280 && name === 'windup') {
                // Render the shipped synthesizer into Web Audio buffers: mapping/visibility are covered separately.
                // This measures the cue generator, not a natural encounter or subjective audibility over gunfire.
                const cues = await page.evaluate(async () => {
                    const Synth = window.__bincovSample.host.sound.out.constructor, results = [];
                    for (const voice of ['crab', 'dog', 'spit', 'heavy', 'salt', 'polearm', 'raider', 'radio']) {
                        for (const phase of ['prepare', 'release', 'warning', 'reload']) {
                            const ctx = new OfflineAudioContext(2, 22050, 44100), audio = new Synth();
                            audio.context = ctx; audio.master = ctx.createGain(); audio.master.connect(ctx.destination);
                            audio.noise = ctx.createBuffer(1, 44100 * 4, 44100);
                            const noise = audio.noise.getChannelData(0);
                            for (let i = 0; i < noise.length; i++) noise[i] = Math.sin(i * 1.37) * .15;
                            audio.resumeAt = performance.now(); audio.enemy(voice, phase, { pan: .5, gain: .7 });
                            const buffer = await ctx.startRendering();
                            const energy = [0, 1].map(channel => buffer.getChannelData(channel).reduce((sum, x) => sum + x * x, 0));
                            results.push({ voice, phase, energy });
                        }
                    }
                    return results;
                });
                assert.equal(cues.length, 32);
                for (const cue of cues) {
                    assert.ok(cue.energy.every(n => Number.isFinite(n) && n > .001), `${cue.voice}/${cue.phase} has real nonzero output`);
                    assert.ok(cue.energy[1] > cue.energy[0] * 2, 'positional cue pans toward its source');
                }
                report.cases.push({ viewport, scenario: 'enemy-synth-output-contract', cues });
            }
            if (viewport.width === 1280 && role === 'sac-spitter' && phase === 'windup') {
                // Presentation-only contract probe using the real saved actor. It does not claim a played encounter.
                const acid = await page.evaluate(uid => {
                    const h = window.__bincovSample.host, v = h.view, original = h.lastBatch;
                    const a = original.frame.actors.find(a => a.uid === uid), p = { x: a.x + 30, y: a.y };
                    const bullet = { uid: 'art-acid', owner: uid, enemy: true, x: a.x, y: a.y, vx: 180, vy: 0 };
                    const publish = (events, bullets = []) => v.present({ ...original, events, frame: { ...original.frame, bullets } }, 0);
                    const event = detail => ({ ...detail, stamp: original.stamp });
                    const shot = event({ type: 'shot', shooter: uid, weapon: 'claw', shotId: 'art-acid',
                        pellets: [{ bullet: 'art-acid', origin: { x: a.x, y: a.y }, angle: 0 }] });
                    const impact = event({ type: 'impact', bullet: 'art-acid', owner: uid, reason: 'range', lastFree: p,
                        contact: null, normal: null, surface: null, target: null });
                    v.fx.clear(); const muzzleBefore = v.muzzles.length;
                    publish([], [bullet]); publish([shot], [{ ...bullet, x: p.x }]);
                    const box = v.bullets.get('art-acid').g.getLocalBounds();
                    const fired = { particles: v.fx.live.length, muzzles: v.muzzles.length - muzzleBefore, projectileHeight: box.height, projectileY: box.y - a.y };
                    v.fx.clear(); publish([impact]);
                    const landed = { particles: v.fx.live.length, permanent: v.fx.decals.length };
                    v.fx.update(2); landed.remaining = v.fx.count;
                    // Diagnostic unrevealed room around the saved actor: exercise the real visibility predicate.
                    // This temporary view map never enters Runtime or storage.
                    const hidden = structuredClone(original), map = v.map;
                    const room = { id: 'art-hidden', name: 'probe', x: a.x - 60, y: a.y - 60, w: 150, h: 120, inside: true, sealed: true, buildingId: null };
                    v.map = { ...map, regions: [...map.regions, room] };
                    hidden.frame.actors = hidden.frame.actors.map(actor => actor.uid === uid ? { ...actor, regionId: room.id } : actor);
                    v.present({ ...hidden, events: [shot, impact] }, 0);
                    const hiddenParticles = v.fx.count;
                    v.map = map;
                    v.present({ ...original, events: [] }, 0);
                    return { fired, landed, hiddenParticles };
                }, saved.uid);
                assert.equal(acid.fired.muzzles, 0); assert.equal(acid.fired.particles, 4);
                assert.ok(acid.fired.projectileHeight >= 4 && acid.fired.projectileY >= -10 && acid.fired.projectileY <= -6);
                assert.deepEqual(acid.landed, { particles: 7, permanent: 0, remaining: 0 });
                assert.equal(acid.hiddenParticles, 0);
                report.cases.push({ viewport, scenario: 'spit-presentation-contract', ...acid });
            }
            await page.close();
        }
        await context.close();
        // Ordinary fresh deployment: only the player's observation position uses the explicit test driver.
        // Enemies, roster, supplies and AI come from the normal seed-45 initialization transaction.
        const nativeContext = await browser.newContext({ viewport, offline: true, hasTouch: touch, isMobile: touch });
        await resumeStalls(nativeContext);
        const native = await nativeContext.newPage(); native.setDefaultTimeout(60000);
        native.on('pageerror', e => report.errors.push(String(e))); native.on('request', r => { if (/^https?:/.test(r.url())) report.external.push(r.url()); });
        await native.goto(pathToFileURL(resolve('dist/index.html')).href + '?test=1&entry=tabs');
        await native.locator('[data-action="enter"]').click(); await native.locator('#seed').fill('45');
        await native.locator('[data-action="deploy"]').click(); await raidReady(native);
        const initial = decodeSession(await native.evaluate(key => localStorage.getItem(key), SESSION_KEY));
        const deployed = Object.values(initial.expansion.raid.maps).flatMap(m => m.enemies);
        const team = deployed.filter(e => e.tactics?.squad === MARKET_RAIDERS), boss = team.find(e => e.id === 'raider-boss');
        assert.equal(deployed.length, 25); assert.equal(team.length, 3); assert.ok(boss);
        assert.ok(initial.expansion.raid.maps.coast.containers.some(c => Math.hypot(c.x-MARKET_STORES.x,c.y-MARKET_STORES.y)<1));
        await drive(native, 'placePlayer', { x: boss.home.x + 160, y: boss.home.y }, Math.PI, 'coast');
        await native.waitForFunction(uid => {
            const a = window.__bincovSample.host.lastBatch.frame.actors.find(a => a.uid === uid);
            return a?.tactics && ['windup','release','recovery'].includes(a.tactics.phase);
        }, boss.uid);
        const combat = actorArchetype(boss);
        assert.equal(boss.tactics.ballistics, 1); assert.equal(combat.ballistics.pellets, 6);
        await native.waitForFunction(uid => window.__bincovSample.host.eventLog.some(e => e.type === 'shot' && e.detail.shooter === uid), boss.uid);
        const shot = await native.evaluate(uid => window.__bincovSample.host.eventLog.find(e => e.type === 'shot' && e.detail.shooter === uid).detail, boss.uid);
        assert.equal(shot.pellets.length, 6); assert.equal(shot.gun.id, boss.tactics.equipment);
        assert.equal(new Set(shot.pellets.map(p => p.bullet)).size, 6);
        assert.ok(new Set(shot.pellets.map(p => p.angle)).size > 1, 'the real enemy shotgun scatters its pellets');
        assert.ok(Math.max(...shot.pellets.map(p => p.angle)) - Math.min(...shot.pellets.map(p => p.angle)) <= combat.ballistics.spread);
        const file = `native-market-${viewport.width}.png`; await native.screenshot({ path: resolve(out,file) }); report.screenshots.push(file);
        if (touch) await native.locator('.coast-sample [data-pause]').tap(); else await native.keyboard.press('Escape');
        await native.waitForFunction(() => window.__bincovSample.host.panel === 'pause');
        const saved = decodeSession(await native.evaluate(key => localStorage.getItem(key), SESSION_KEY));
        const spent = saved.expansion.raid.maps.coast.enemies.find(e => e.uid === boss.uid).tactics;
        assert.ok(spent.magazine + spent.reserve < combat.ballistics.budget, 'real fire consumes finite shells before refresh');
        await native.reload(); await native.locator('[data-action="enter"]').click(); await raidReady(native);
        const loaded = decodeSession(await native.evaluate(key => localStorage.getItem(key), SESSION_KEY));
        const members = r => r.expansion.raid.maps.coast.enemies.filter(e => e.tactics?.squad === MARKET_RAIDERS);
        assert.deepEqual(members(loaded),members(saved), 'paused checkpoint preserves complete native squad without restocking');
        report.cases.push({ viewport, scenario: 'native-market-deployment-and-restore', population: deployed.length,
            squad: team.map(e => ({ uid:e.uid,id:e.id })), saveVersion:loaded.version, screenshot:file,
            gun:boss.tactics.equipment, pellets:shot.pellets.length, remainingShells:spent.magazine+spent.reserve, damagePerPellet:combat.damage, range:combat.range });
        console.log(`PASS native-market ${viewport.width}: ordinary deployment, attack and checkpoint restore`);
        await nativeContext.close();
        for(const focus of ['tidal-crab','saltback-dog','sac-spitter']){
            const ecologyContext=await browser.newContext({viewport,offline:true,hasTouch:touch,isMobile:touch});await resumeStalls(ecologyContext);
            const ecology=await ecologyContext.newPage();ecology.setDefaultTimeout(60000);
            ecology.on('pageerror',e=>report.errors.push(String(e)));ecology.on('request',r=>{if(/^https?:/.test(r.url()))report.external.push(r.url());});
            await ecology.goto(pathToFileURL(resolve('dist/index.html')).href+'?test=1&entry=tabs');
            await ecology.locator('[data-action="enter"]').click();await ecology.locator('#seed').fill('46');await ecology.locator('[data-action="deploy"]').click();await raidReady(ecology);
            const initial=decodeSession(await ecology.evaluate(key=>localStorage.getItem(key),SESSION_KEY)),raid=initial.expansion.raid;
            const fauna=raid.maps.coast.enemies.filter(e=>e.tactics?.squad===FAUNA_SQUAD),actor=fauna.find(e=>e.id===focus);
            assert.equal(raid.roster.length,25);assert.equal(fauna.length,4);assert.ok(actor);
            const site=FAUNA_SITES.find(s=>s.id===focus&&s.foodX!==undefined),source=raid.maps.coast.loot.find(l=>l.id==='food'&&l.x===(site.foodX+.5)*32&&l.y===(site.y+.5)*32);
            assert.ok(source);const context={definition:BUILDING_WORLD.maps.coast,doors:raid.maps.coast.doors,highTide:raid.highTide};
            const radius=focus==='tidal-crab'?48:96;
            const observer=Array.from({length:16},(_,i)=>({x:actor.home.x+Math.cos(i*Math.PI/8)*radius,y:actor.home.y+Math.sin(i*Math.PI/8)*radius}))
                .filter(p=>traversable(context,p,'body',10)&&corridor(context,actor,p,'sight')&&raid.maps.coast.enemies.every(e=>Math.hypot(p.x-e.x,p.y-e.y)>=24))
                .sort((a,b)=>Math.min(...fauna.filter(e=>e!==actor).map(e=>Math.hypot(b.x-e.x,b.y-e.y)))-Math.min(...fauna.filter(e=>e!==actor).map(e=>Math.hypot(a.x-e.x,a.y-e.y))))[0];
            assert.ok(observer);let collected=false;
            if(focus==='tidal-crab'){
                await drive(ecology,'placePlayer',{x:source.x,y:source.y},Math.PI,'coast');
                const before=await ecology.evaluate(()=>window.__bincov.app.loadout.bag.items.filter(i=>i.id==='food').reduce((n,i)=>n+i.qty,0));
                if(touch)await ecology.locator('.coast-sample [data-act]').tap();else await ecology.keyboard.press('e');
                await ecology.waitForFunction(uid=>!window.__bincovSample.host.lastBatch.frame.loot.some(l=>l.uid===uid),source.uid);
                const after=await ecology.evaluate(()=>window.__bincov.app.loadout.bag.items.filter(i=>i.id==='food').reduce((n,i)=>n+i.qty,0));
                assert.equal(after,before+1);collected=true;
            }else await drive(ecology,'placePlayer',observer,Math.atan2(actor.y-observer.y,actor.x-observer.x),'coast');
            await ecology.waitForFunction(uid=>{const a=window.__bincovSample.host.lastBatch.frame.actors.find(a=>a.uid===uid);return a?.tactics&&['windup','release','recovery'].includes(a.tactics.phase);},actor.uid);
            const image=`native-fauna-${focus}-${viewport.width}.png`;await ecology.screenshot({path:resolve(out,image)});report.screenshots.push(image);
            if(touch)await ecology.locator('.coast-sample [data-pause]').tap();else await ecology.keyboard.press('Escape');
            await ecology.waitForFunction(()=>window.__bincovSample.host.panel==='pause');
            const saved=decodeSession(await ecology.evaluate(key=>localStorage.getItem(key),SESSION_KEY));
            await ecology.reload();await ecology.locator('[data-action="enter"]').click();await raidReady(ecology);
            const restored=decodeSession(await ecology.evaluate(key=>localStorage.getItem(key),SESSION_KEY));
            const members=r=>r.expansion.raid.maps.coast.enemies.filter(e=>e.tactics?.squad===FAUNA_SQUAD);
            assert.deepEqual(members(restored),members(saved));
            assert.deepEqual(restored.expansion.raid.maps.coast.loot,saved.expansion.raid.maps.coast.loot);
            if(collected)assert.equal(restored.expansion.raid.maps.coast.loot.some(l=>l.uid===source.uid),false,'collected nest food never respawns on refresh');
            report.cases.push({viewport,scenario:`native-fauna-${focus}`,population:25,animals:4,collected,screenshot:image});
            console.log(`PASS native-fauna ${focus} ${viewport.width}: ordinary deployment, attack, food and restore`);await ecologyContext.close();
        }
        for(const [seed,focus] of [[47,'salt-dazed'],[47,'tide-chaser'],[47,'tide-ritualist'],[62,'tide-ritualist'],[47,'salt-hulk']]) {
            const ctx=await browser.newContext({viewport,offline:true,hasTouch:touch,isMobile:touch});await resumeStalls(ctx);
            const p=await ctx.newPage();p.setDefaultTimeout(60000);
            p.on('pageerror',e=>report.errors.push(String(e)));p.on('request',r=>{if(/^https?:/.test(r.url()))report.external.push(r.url());});
            await p.goto(pathToFileURL(resolve('dist/index.html')).href+'?test=1&entry=tabs');
            await p.locator('[data-action="enter"]').click();await p.locator('#seed').fill(String(seed));await p.locator('[data-action="deploy"]').click();await raidReady(p);
            const initial=decodeSession(await p.evaluate(key=>localStorage.getItem(key),SESSION_KEY)),raid=initial.expansion.raid;
            const team=raid.maps.coast.enemies.filter(e=>e.tactics?.squad===AFFECTED_SQUAD),actor=team.find(e=>e.id===focus);
            assert.equal(raid.roster.length,25);assert.equal(team.length,4);assert.equal(actor?.tactics?.version,2);
            const point=await p.evaluate(uid=>{const a=window.__bincovSample.host.lastBatch.frame.actors.find(a=>a.uid===uid);return {x:a.x,y:a.y};},actor.uid);
            const context={definition:BUILDING_WORLD.maps.coast,doors:raid.maps.coast.doors,highTide:raid.highTide};
            const radius=focus==='salt-dazed'?28:focus==='tide-chaser'?80:focus==='salt-hulk'?48:seed===47?64:42;
            const observer=Array.from({length:16},(_,i)=>({x:point.x+Math.cos(i*Math.PI/8)*radius,y:point.y+Math.sin(i*Math.PI/8)*radius}))
                .filter(at=>traversable(context,at,'body',10)&&corridor(context,point,at,'sight')&&raid.maps.coast.enemies.every(e=>Math.hypot(at.x-e.x,at.y-e.y)>=24))
                .sort((a,b)=>Math.min(...team.filter(e=>e!==actor).map(e=>Math.hypot(b.x-e.x,b.y-e.y)))-Math.min(...team.filter(e=>e!==actor).map(e=>Math.hypot(a.x-e.x,a.y-e.y))))[0];
            assert.ok(observer);await drive(p,'placePlayer',observer,Math.atan2(point.y-observer.y,point.x-observer.x),'coast');
            await p.waitForFunction(uid=>{const a=window.__bincovSample.host.lastBatch.frame.actors.find(a=>a.uid===uid);return a?.tactics&&['windup','release','recovery'].includes(a.tactics.phase);},actor.uid);
            const actual=await p.evaluate(uid=>{const a=window.__bincovSample.host.lastBatch.frame.actors.find(a=>a.uid===uid);return {weapon:a.weapon,range:a.tactics.range};},actor.uid);
            if(focus==='tide-ritualist')assert.deepEqual(actual,{weapon:seed===47?'rifle':'club',range:actorArchetype(actor).range});
            const image=`native-affected-${focus}-${seed}-${viewport.width}.png`;await p.screenshot({path:resolve(out,image)});report.screenshots.push(image);
            if(touch)await p.locator('.coast-sample [data-pause]').tap();else await p.keyboard.press('Escape');
            await p.waitForFunction(()=>window.__bincovSample.host.panel==='pause');
            const saved=decodeSession(await p.evaluate(key=>localStorage.getItem(key),SESSION_KEY));
            await p.reload();await p.locator('[data-action="enter"]').click();await raidReady(p);
            const restored=decodeSession(await p.evaluate(key=>localStorage.getItem(key),SESSION_KEY));
            const members=r=>r.expansion.raid.maps.coast.enemies.filter(e=>e.tactics?.squad===AFFECTED_SQUAD);
            assert.deepEqual(members(restored),members(saved),'actual armament, paid phases and ammunition survive the normal checkpoint');
            report.cases.push({viewport,scenario:`native-affected-${focus}-${seed}`,population:25,actual,screenshot:image});
            console.log(`PASS native-affected ${focus} ${seed} ${viewport.width}: ordinary deployment, paid attack and restore`);await ctx.close();
        }
        for(const {id:focus} of RECOVERY_POSTS) {
            const ctx=await browser.newContext({viewport,offline:true,hasTouch:touch,isMobile:touch});await resumeStalls(ctx);
            const p=await ctx.newPage();p.setDefaultTimeout(60000);
            p.on('pageerror',e=>report.errors.push(String(e)));p.on('request',r=>{if(/^https?:/.test(r.url()))report.external.push(r.url());});
            await p.goto(pathToFileURL(resolve('dist/index.html')).href+'?test=1&entry=tabs');
            await p.locator('[data-action="enter"]').click();await p.locator('#seed').fill('48');await p.locator('[data-action="deploy"]').click();await raidReady(p);
            const initial=decodeSession(await p.evaluate(key=>localStorage.getItem(key),SESSION_KEY)),raid=initial.expansion.raid;
            const team=raid.maps.coast.enemies.filter(e=>e.tactics?.squad===RECOVERY_SQUAD),actor=team.find(e=>e.id===focus),leader=team.find(e=>e.id==='recovery-leader');
            assert.equal(raid.roster.length,25);assert.equal(team.length,4);assert.ok(actor);const cargoId=leader.tactics.program.crate;
            let carried=false;
            if(focus==='recovery-leader') {
                // Observe live AI from the public side; do not move the team, cargo, health or simulation clock.
                await drive(p,'placePlayer',{x:6.5*32,y:RECOVERY_PICKUP.y},0,'coast');
                await p.waitForFunction(([uid,id])=>{const f=window.__bincovSample.host.lastBatch.frame,a=f.actors.find(a=>a.uid===uid),c=f.containers.find(c=>c.id===id);
                    return !!a&&!!c&&c.x>610&&Math.hypot(c.x-a.x,c.y-a.y)<1;},[leader.uid,cargoId]);carried=true;
            }
            const point=await p.evaluate(uid=>{const a=window.__bincovSample.host.lastBatch.frame.actors.find(a=>a.uid===uid);return {x:a.x,y:a.y};},actor.uid);
            const context={definition:BUILDING_WORLD.maps.coast,doors:raid.maps.coast.doors,highTide:raid.highTide};
            const observer=Array.from({length:16},(_,i)=>({x:point.x+Math.cos(i*Math.PI/8)*32,y:point.y+Math.sin(i*Math.PI/8)*32}))
                .find(at=>traversable(context,at,'body',10)&&corridor(context,point,at,'sight'));
            assert.ok(observer);await drive(p,'placePlayer',observer,Math.atan2(point.y-observer.y,point.x-observer.x),'coast');
            // Keep the observation fixture inside the moving warning boundary until four real seconds elapse.
            // Only the player position changes; NPCs, cargo, ammo, health and time remain live.
            await p.waitForFunction(([uid,dx,dy])=>{const h=window.__bincovSample,a=h.host.lastBatch.frame.actors.find(a=>a.uid===uid);
                if(a?.tactics&&['windup','release','recovery'].includes(a.tactics.phase))return true;
                if(a)h.driver.placePlayer({x:a.x+dx,y:a.y+dy},Math.atan2(-dy,-dx),'coast');return false;
            },[actor.uid,observer.x-point.x,observer.y-point.y],{polling:200});
            const image=`native-recovery-${focus}-${viewport.width}.png`;await p.screenshot({path:resolve(out,image)});report.screenshots.push(image);
            if(touch)await p.locator('.coast-sample [data-pause]').tap();else await p.keyboard.press('Escape');
            await p.waitForFunction(()=>window.__bincovSample.host.panel==='pause');
            const saved=decodeSession(await p.evaluate(key=>localStorage.getItem(key),SESSION_KEY));
            await p.reload();await p.locator('[data-action="enter"]').click();await raidReady(p);
            const restored=decodeSession(await p.evaluate(key=>localStorage.getItem(key),SESSION_KEY));
            const members=r=>r.expansion.raid.maps.coast.enemies.filter(e=>e.tactics?.squad===RECOVERY_SQUAD);
            assert.deepEqual(members(restored),members(saved),'cargo orders, paid phases and ammunition survive the actual pause checkpoint');
            const cargo=r=>r.expansion.raid.maps.coast.containers.filter(c=>c.id===cargoId);
            assert.equal(cargo(restored).length,1);assert.deepEqual(cargo(restored),cargo(saved));
            report.cases.push({viewport,scenario:`native-recovery-${focus}`,population:25,team:4,carried,screenshot:image});
            console.log(`PASS native-recovery ${focus} ${viewport.width}: ordinary deployment, cargo, attack and restore`);await ctx.close();
        }
        for(const focus of ['blockade-sentry','blockade-patrol','blockade-sergeant']) {
            const ctx=await browser.newContext({viewport,offline:true,hasTouch:touch,isMobile:touch});await resumeStalls(ctx);
            const p=await ctx.newPage();p.setDefaultTimeout(60000);
            p.on('pageerror',e=>report.errors.push(String(e)));p.on('request',r=>{if(/^https?:/.test(r.url()))report.external.push(r.url());});
            await p.goto(pathToFileURL(resolve('dist/index.html')).href+'?test=1&entry=tabs');
            await p.locator('[data-action="enter"]').click();await p.locator('#seed').fill('49');await p.locator('[data-action="deploy"]').click();await raidReady(p);
            const initial=decodeSession(await p.evaluate(key=>localStorage.getItem(key),SESSION_KEY)),raid=initial.expansion.raid;
            const team=raid.maps.coast.enemies.filter(e=>e.tactics?.squad===BLOCKADE_SQUAD),actor=team.find(e=>e.id===focus);
            assert.equal(raid.roster.length,25);assert.equal(team.length,3);assert.ok(actor);
            if(focus==='blockade-sentry') {
                await drive(p,'placePlayer',BLOCKADE_WAIT_POINT,0,'coast');
                if(touch)await p.locator('.coast-sample [data-act]').tap();else await p.keyboard.press('e');
                await p.waitForFunction(()=>window.__bincovSample.host.lastBatch.frame.actors.some(a=>a.tactics?.checkpoint?.phase==='waiting'&&a.tactics.checkpoint.waited>=1.5));
                if(touch)await p.locator('.coast-sample [data-pause]').tap();else await p.keyboard.press('Escape');
                await p.waitForFunction(()=>window.__bincovSample.host.panel==='pause');
                const paid=decodeSession(await p.evaluate(key=>localStorage.getItem(key),SESSION_KEY));
                await p.reload();await p.locator('[data-action="enter"]').click();await raidReady(p);
                const resumed=decodeSession(await p.evaluate(key=>localStorage.getItem(key),SESSION_KEY));
                const members=r=>r.expansion.raid.maps.coast.enemies.filter(e=>e.tactics?.squad===BLOCKADE_SQUAD);
                assert.deepEqual(members(resumed),members(paid),'pending registration and already waited time survive refresh');
                const resume=p.locator('.coast-sample [data-do="resume"]');if(await resume.isVisible())await resume.click();
                await p.waitForFunction(()=>window.__bincovSample.host.lastBatch.frame.actors.some(a=>a.tactics?.checkpoint?.phase==='granted'));
                const image=`native-blockade-registration-${viewport.width}.png`;await p.screenshot({path:resolve(out,image)});report.screenshots.push(image);
                // Cross the actual permission corridor through real keyboard/joystick input, without moving NPCs or time.
                let cdp;
                try {
                    if(touch) {
                        cdp=await ctx.newCDPSession(p);const origin=await p.evaluate(()=>{
                            for(let d=0;d<96;d+=8)for(const [dx,dy] of [[0,0],[d,0],[-d,0],[0,d],[0,-d]]) {
                                const x=Math.round(innerWidth*.22+dx),y=Math.round(innerHeight*.55+dy);
                                if(document.elementFromPoint(x,y)?.tagName==='CANVAS')return {x,y};
                            }return null;
                        });assert.ok(origin);
                        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,...origin}]});
                        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:origin.x+64,y:origin.y}]});
                    } else await p.keyboard.down('d');
                    await p.waitForFunction(()=>window.__bincovSample.host.lastBatch.frame.player.x>=1170,null,{timeout:20000});
                } finally {if(touch&&cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await p.keyboard.up('d');}
                await frames(p,3);
                const access=await p.evaluate(ids=>window.__bincovSample.host.lastBatch.frame.actors.filter(a=>ids.includes(a.uid)).map(a=>a.tactics.stance),team.map(e=>e.uid));
                assert.ok(access.every(stance=>stance==='idle'),'a legal passage must not provoke the checkpoint');
                report.cases.push({viewport,scenario:'native-blockade-registration-and-passage',waitRestored:true,input:touch?'native tap and CDP joystick':'native E and keyboard',screenshot:image});
            } else if(focus==='blockade-patrol') {
                await p.waitForFunction(([uid,home])=>{const a=window.__bincovSample.host.lastBatch.frame.actors.find(a=>a.uid===uid);return a&&Math.hypot(a.x-home.x,a.y-home.y)>8;},[actor.uid,actor.home]);
            }
            await drive(p,'placePlayer',{x:actor.home.x,y:actor.home.y-32},Math.PI/2,'coast');
            await p.waitForFunction(uid=>{const a=window.__bincovSample.host.lastBatch.frame.actors.find(a=>a.uid===uid);return a?.tactics&&['windup','release','recovery'].includes(a.tactics.phase);},actor.uid);
            const image=`native-blockade-${focus}-${viewport.width}.png`;await p.screenshot({path:resolve(out,image)});report.screenshots.push(image);
            if(touch)await p.locator('.coast-sample [data-pause]').tap();else await p.keyboard.press('Escape');
            await p.waitForFunction(()=>window.__bincovSample.host.panel==='pause');
            const saved=decodeSession(await p.evaluate(key=>localStorage.getItem(key),SESSION_KEY));
            await p.reload();await p.locator('[data-action="enter"]').click();await raidReady(p);
            const restored=decodeSession(await p.evaluate(key=>localStorage.getItem(key),SESSION_KEY));
            const members=r=>r.expansion.raid.maps.coast.enemies.filter(e=>e.tactics?.squad===BLOCKADE_SQUAD);
            assert.deepEqual(members(restored),members(saved),'engagement, permission, ammunition and paid attack survive actual refresh');
            report.cases.push({viewport,scenario:`native-blockade-${focus}`,population:25,team:3,screenshot:image});
            console.log(`PASS native-blockade ${focus} ${viewport.width}: ordinary registration/patrol, paid trespass reaction and restore`);await ctx.close();
        }
        completeEnemyUnit(coverage, viewport, 'street', report.cases);
    }
    await runMallEnemyCases(browser, report, out, { viewports: selection.viewports,
        onViewportComplete: viewport => completeEnemyUnit(coverage, viewport, 'mall', report.cases) });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.external, []);
    coverage.status = 'passed'; coverage.finishedAt = new Date().toISOString();
    validateEnemyCoverage(coverage, selection.shard, identity);
    report.status = 'PASS';
} finally {
    await browser.close(); await writeFile(reportPath, JSON.stringify(report, null, 2));
}
console.log(JSON.stringify(report, null, 2));
