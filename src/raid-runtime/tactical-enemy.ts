import type { EnemyState } from '../checkpoint';
import { actorArchetype, enemyBoundary } from '../enemy-archetypes';
import { canReceiveReport, enemyRelation } from '../enemy-relations';
import type { Point } from '../world';
import type { LegacyEnemyWorld } from './enemy-ai';
import { enemyPost } from '../enemy-posts';
import type { LootContainer } from '../loot';
import { recoveryObjective } from './recovery-objective';
import { advanceBlockadeCheckpoint } from './blockade-checkpoint';
import { blockadePassageAllowed, blockadeProgram } from '../enemy-blockade';

interface TacticalWorld extends LegacyEnemyWorld {
    readonly elapsed: number;
    readonly enemies: EnemyState[];
    readonly containers?: readonly LootContainer[];
}
export interface TacticalEffects {
    fire(enemy: EnemyState, angle: number): void;
    strike(enemy: EnemyState, target: string): void;
    openDoor(enemy: EnemyState, id: string): void;
    notice(enemy: EnemyState, message: string): void;
}
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const angle = (a: Point, b: Point) => Math.atan2(b.y - a.y, b.x - a.x);
const delta = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const turnToward = (from: number, to: number, limit: number) => {
    const next = from + Math.max(-limit,Math.min(limit,delta(to,from)));
    return Math.atan2(Math.sin(next),Math.cos(next));
};

function observedTarget(world: TacticalWorld, e: EnemyState) {
    const def = actorArchetype(e)!, t = e.tactics!, boundary=enemyBoundary(e);
    const candidates = [{ uid: 'player', point: world.player, relation: def.stance === 'hostile' || blockadeProgram(e)?.phase==='engaged' ? 'hostile' : 'neutral' },
        ...world.enemies.filter(other => other !== e && other.hp > 0 && other.tactics)
            .map(other => ({ uid: other.uid, point: other, relation: enemyRelation(e, other) }))];
    return candidates.filter(c => c.relation !== 'friendly' && distance(e, c.point) <= def.vision && world.sight(e, c.point)
        && (!(t.phase === 'windup' || t.phase === 'release') || !t.memory || t.memory.target === c.uid))
        .map(c => ({ ...c, engaged: t.stance === 'hostile' && t.memory?.target === c.uid,
            inside: !(c.uid==='player'&&blockadePassageAllowed(e,c.point)) && distance(boundary?.at??e.home, c.point) < (boundary?.radius??def.territory * .55) }))
        .filter(c => t.stance !== 'hostile' || !t.memory || world.elapsed - t.memory.time > 7 || c.engaged || c.relation === 'hostile')
        .filter(c => c.uid === 'player' || c.engaged || c.relation === 'hostile' || def.stance !== 'hostile' && c.inside)
        .sort((a, b) => Number(b.engaged) - Number(a.engaged) || Number(b.relation === 'hostile') - Number(a.relation === 'hostile')
            || distance(e, a.point) - distance(e, b.point) || a.uid.localeCompare(b.uid, 'en'))[0];
}

/** A swing hits the first body along its locked direction. Allies block it, as they block bullets. */
function meleeContact(world: TacticalWorld, e: EnemyState): string | null {
    const def = actorArchetype(e)!, reach = def.attack === 'pounce' ? 36 : def.range;
    const bodies = [{ uid: 'player', point: world.player, enemy: null as EnemyState | null },
        ...world.enemies.filter(other => other !== e && other.hp > 0).map(other => ({ uid: other.uid, point: other, enemy: other }))];
    const first = bodies.filter(c => distance(e, c.point) <= reach && Math.abs(delta(angle(e, c.point), e.tactics!.lockedAim)) <= .65
        && world.sight(e, c.point, world.highTide, 10)).sort((a, b) => distance(e, a.point) - distance(e, b.point) || a.uid.localeCompare(b.uid, 'en'))[0];
    return first?.uid ?? null;
}

/** v4 controller. Perception writes a value snapshot; locomotion/search never dereference an unseen target.
 * The phase machine consumes at most one release per substep. It keeps its cost and locked direction on restore.
 * All changes live on EnemyState, including limited ammunition, warning and one-use squad reports. */
export function advanceTacticalEnemy(world: TacticalWorld, effects: TacticalEffects, e: EnemyState, dt: number): void {
    const def = actorArchetype(e)!, t = e.tactics!;
    advanceBlockadeCheckpoint(world,e,dt,effects.notice);
    const objective=recoveryObjective(world,e,effects.notice);
    const observed = observedTarget(world, e), sees = !!observed, inside = !!observed?.inside;
    e.cooldown = Math.max(0, e.cooldown - dt); e.repath -= dt; e.timer -= dt;
    t.awareness = Math.max(0, Math.min(1, t.awareness + (sees ? dt / def.confirm : -dt * .5)));
    if (observed) {
        if (t.memory && t.memory.target !== observed.uid) { t.awareness = 0; t.warning = 0; if (t.stance !== 'retreat') t.stance = 'idle'; }
        t.memory = { at: { x: observed.point.x, y: observed.point.y }, time: world.elapsed, source: 'sight', target: observed.uid };
        if (t.stance !== 'hostile' && t.stance !== 'retreat' && t.awareness >= 1) {
            if (observed.relation === 'hostile') t.stance = 'hostile';
            else if (inside) {
                if (t.stance !== 'warning' && observed.uid === 'player') effects.notice(e, def.stance === 'conditional' ? '前方是限制区，请退回公共通道。' : '正在护卫领地，退开可避战。');
                t.stance = 'warning'; t.warning = Math.min(5, t.warning + dt);
                if (t.warning >= (def.stance === 'conditional' ? 4 : 1.5)) t.stance = 'hostile';
            }
        }
    } else if (t.phase === 'idle' && world.noiseTime > 0 && world.shotNoise && distance(e, world.shotNoise) <= Math.min(300, world.noiseRadius)) {
        // Hearing locates a sound, not the player after they leave it; it alone never authorizes a shot.
        if (t.stance !== 'hostile' && (t.memory?.source !== 'sight' || world.elapsed - t.memory.time > 1))
            t.memory = { at: { ...world.shotNoise }, time: world.elapsed, source: 'sound', target: 'player' };
    }
    if (!inside && t.stance === 'warning') {
        t.warning = Math.max(0, t.warning - dt * 2);
        if (t.warning === 0) t.stance = 'idle';
    }
    if (t.stance === 'hostile' && def.signal && !t.signalUsed && t.memory?.source === 'sight') {
        t.signalUsed = true;
        let reported=0;
        for (const ally of world.enemies) {
            if (ally === e || ally.hp <= 0 || !ally.tactics || !canReceiveReport(e, ally) || distance(e, ally) > 320) continue;
            if (t.memory.target !== 'player') {
                const target = world.enemies.find(other => other.uid === t.memory!.target);
                if (!target || enemyRelation(ally, target) === 'friendly') continue;
            }
            ally.tactics.memory = { ...structuredClone(t.memory), source: 'report' };
            ally.tactics.stance = 'hostile'; ally.tactics.awareness = 1;
            reported++;
        }
        effects.notice(e,reported?'正在向附近同组报告最后目击位置。':'正在呼喊，附近没有收到回应。');
    }
    const flooded = world.highTide && !world.walkable(e.x, e.y, true, 10);
    const stale = !t.memory || world.elapsed - t.memory.time > 7;
    const outside = distance(e, e.home) > def.territory;
    if (t.stance === 'hostile' && (stale || outside)) {
        t.stance = 'idle'; t.memory = null; t.warning = 0;
    }
    if (e.hp < def.hp * .25 && t.stance === 'hostile') t.stance = 'retreat';
    if (['raider-boss', 'recovery-leader'].includes(e.id) && t.stance === 'hostile') {
        const members = world.enemies.filter(ally => ally !== e && canReceiveReport(e, ally));
        const losses = members.filter(ally => ally.hp <= 0 && distance(e, ally) <= def.vision && world.sight(e, ally));
        if (members.length && losses.length >= Math.ceil(members.length / 2)) {
            t.stance = 'retreat'; effects.notice(e, '同伴损失，正在撤回。');
        }
    }
    // A winding attack cannot be cancelled for a free reload/cooldown by losing sight or refreshing.
    if (t.phase !== 'idle') {
        e.state = 'attack'; e.rotation = t.lockedAim;
        const phaseTime = t.phaseLeft;
        t.phaseLeft = Math.max(0, t.phaseLeft - dt);
        if (t.phase === 'windup' && t.phaseLeft === 0) {
            t.phase = 'release'; t.phaseLeft = def.attack === 'pounce' ? .3 : 0;
            return;
        }
        if (t.phase === 'release') {
            if (def.attack === 'pounce') {
                // Sweep at <= 8 px so a low-frame step cannot leap past a body or extend the paid lunge.
                const travel = 300 * Math.min(dt, phaseTime), steps = Math.max(1, Math.ceil(travel / 8));
                let stopped = !!meleeContact(world, e);
                for (let i = 0; i < steps && !stopped; i++) {
                    const before = { x: e.x, y: e.y };
                    world.move(e, Math.cos(t.lockedAim) * travel / steps, Math.sin(t.lockedAim) * travel / steps);
                    stopped = distance(before, e) < .01 || !!meleeContact(world, e);
                }
                if (!stopped && t.phaseLeft > 0) return;
            }
            // Effects may restore entity objects. Publish the next phase before invoking them.
            t.phase = 'recovery'; t.phaseLeft = def.recovery;
            if (def.attack === 'projectile') {
                if (t.magazine > 0) { t.magazine--; effects.fire(e, t.lockedAim); }
            } else if (def.attack === 'spit') effects.fire(e, t.lockedAim);
            else { const contact = meleeContact(world, e); if (contact) effects.strike(e, contact); }
            return;
        }
        if (t.phaseLeft === 0) {
            if (t.phase === 'reload') {
                const count = Math.min(def.magazine - t.magazine, t.reserve);
                t.magazine += count; t.reserve -= count;
            }
            t.phase = 'idle'; e.cooldown = .15;
        }
        return;
    }
    // Support alone may briefly suppress a credible last sight/report. Starting a paid windup is bounded
    // to two seconds after that observation; the committed release still completes without tracking.
    const suppression = e.id === 'mercenary-support' && t.memory && ['sight', 'report'].includes(t.memory.source)
        && world.elapsed - t.memory.time < 2 ? t.memory.at : null;
    const attackPoint = observed?.point ?? suppression;
    if (!flooded && t.stance === 'hostile' && attackPoint && distance(e, attackPoint) < def.range && e.cooldown === 0) {
        if (t.version === 2 && e.id === 'salt-hulk') {
            // A heavy body turns before paying its windup, never snaps across a target on the far side.
            e.rotation = turnToward(e.rotation,angle(e,attackPoint),1.1*dt);
            if (Math.abs(delta(angle(e,attackPoint),e.rotation)) > .4) { e.state='chase'; return; }
        }
        t.lockedAim = angle(e, attackPoint); e.rotation = t.lockedAim;
        if (def.magazine && t.magazine === 0) {
            if (t.reserve === 0) t.stance = 'retreat';
            else { t.phase = 'reload'; t.phaseLeft = def.reload; effects.notice(e, '正在换弹。'); }
        } else {
            t.phase = 'windup'; t.phaseLeft = def.windup;
            // Only an irrevocably paid attack at the actually seen player confirms an exchange.
            // A warning/report from an empty weapon, or combat with an NPC, cannot revoke clearance.
            const permission=blockadeProgram(e);
            if(permission&&permission.phase!=='engaged'&&observed?.uid==='player') {
                permission.phase='engaged';permission.since=world.elapsed;
                effects.notice(e,'通行许可已暂停，请脱离交火区域。');
            }
        }
        e.state = 'attack'; return;
    }
    let target: Point;
    if (flooded) target = world.dryRefuge(e) ?? e.home;
    else if (t.stance === 'retreat' || outside || stale) { target = e.home; e.state = 'return'; }
    else if (t.stance === 'hostile' || t.memory?.source === 'sound' || t.memory?.source === 'report') {
        target = t.memory!.at; e.state = sees && t.stance === 'hostile' ? 'chase' : 'investigate';
        if (['blockade-sentry', 'blockade-sergeant', 'mercenary-support'].includes(e.id)) target = e.home;
        else if (observed && ['raider-melee', 'mercenary-assault'].includes(e.id)) {
            const side = [...e.uid].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 2 ? 1 : -1;
            const bearing = angle(e, target), flank = { x: target.x - Math.sin(bearing) * 24 * side, y: target.y + Math.cos(bearing) * 24 * side };
            if (world.walkable(flank.x, flank.y, world.highTide, 10)) target = flank;
        }
        else if (observed && e.id === 'saltback-dog') {
            // A dog only uses a companion it can actually see; no radio or shared target coordinates.
            // The lower identity approaches head-on, the other takes a small reachable side angle.
            const companion = world.enemies.filter(other => other !== e && other.hp > 0 && other.id === e.id
                && other.tactics?.squad === t.squad && distance(e,other) <= def.vision && world.sight(e,other))
                .sort((a,b)=>a.uid.localeCompare(b.uid,'en'))[0];
            if (companion && e.uid.localeCompare(companion.uid,'en') > 0) {
                const bearing=angle(e,target),flank={x:target.x-Math.sin(bearing)*24,y:target.y+Math.cos(bearing)*24};
                if(world.walkable(flank.x,flank.y,world.highTide,10))target=flank;
            }
        }
    } else { target = e.home; e.state = 'patrol'; }
    const post = enemyPost(e);
    if (post && !flooded) {
        if (t.stance === 'retreat') { target = post.fallback; e.state = 'return'; }
        else if (stale) {
            let index = post.patrol.findIndex(p => distance(p, e.target) < .1);
            if (index < 0) index = 0;
            if (distance(e, post.patrol[index]) < 12 && e.timer <= 0) {
                index = (index + 1) % post.patrol.length; e.timer = 2;
            }
            target = post.patrol[index]; e.state = 'patrol';
        } else if (t.stance === 'hostile' && distance(target, e.home) > 96) {
            // The leader and guards defend their assigned side instead of emptying the compound.
            target = e.home; e.state = 'return';
        }
    }
    if(objective&&!flooded) {
        target=objective;
        if(t.stance==='retreat')e.state='return';else if(t.stance!=='hostile')e.state='patrol';
    }
    e.target = { ...target }; e.alert = t.memory ? Math.max(0, 7 - (world.elapsed - t.memory.time)) : 0;
    if (post && stale && t.stance !== 'retreat' && !flooded && e.timer > 0) return;
    if (distance(e, target) < 12) return;
    if (e.repath <= 0) { e.path = world.path(e, target, flooded ? false : world.highTide); e.repath = .8; }
    while (e.path.length && distance(e, e.path[0]) < 12) e.path.shift();
    const next = world.sight(e, target, world.highTide, 10) && world.walkable(target.x, target.y, world.highTide) ? target : e.path[0];
    if (!next) return;
    const facing = angle(e, next), speed = def.speed * (t.stance === 'retreat' ? 1.15 : 1);
    if (world.space) {
        const at = { x: e.x + Math.cos(facing) * (speed * dt + 12), y: e.y + Math.sin(facing) * (speed * dt + 12) };
        const door = world.space.definition.doors.find(d => Math.floor(at.x / 32) === d.x && Math.floor(at.y / 32) === d.y);
        if (door && !world.space.doors[door.id]) { effects.openDoor(e, door.id); return; }
    }
    if (t.version === 2 && e.id === 'salt-hulk') {
        e.rotation = turnToward(e.rotation,facing,1.1*dt);
        if (Math.abs(delta(facing,e.rotation)) > .4) return;
    } else e.rotation = facing;
    world.move(e, Math.cos(facing) * speed * dt, Math.sin(facing) * speed * dt, flooded);
}
