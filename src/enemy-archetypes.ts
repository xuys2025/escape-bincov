import { ENEMIES, type EnemyDef } from './domain';
import type { Point } from './world';

/** Rules for newly authored encounters. Legacy IDs and their saved behaviour remain in ENEMIES. */
type Faction = 'raiders' | 'fauna' | 'affected' | 'mercenaries' | 'blockade';
type Weapon = 'club' | 'claw' | 'pistol' | 'shotgun' | 'rifle';
interface Archetype extends EnemyDef {
    faction: Faction; stance: 'hostile' | 'territorial' | 'conditional';
    attack: 'melee' | 'pounce' | 'projectile' | 'spit'; weapon: Weapon;
    body: 'scav' | 'salt' | 'creature' | 'elite';
    windup: number; recovery: number; magazine: number; reserve: number; reload: number;
    territory: number; confirm: number; signal: boolean; armor: number;
}
function define(id: string, name: string, faction: Faction, body: Archetype['body'], attack: Archetype['attack'], weapon: Weapon,
    hp: number, speed: number, damage: number, range: number, patch: Partial<Archetype> = {}): Readonly<Archetype> {
    const armed = attack === 'projectile';
    return Object.freeze({ id, name, faction, body, attack, weapon, hp, speed, damage, range,
        vision: armed ? 300 : 220, cooldown: 1.2, color: 0xab9370,
        stance: faction === 'raiders' ? 'hostile' : faction === 'fauna' || faction === 'affected' ? 'territorial' : 'conditional',
        windup: armed ? .65 : .55, recovery: armed ? .5 : .8,
        magazine: armed ? (weapon === 'shotgun' ? 2 : 6) : 0, reserve: armed ? 12 : 0, reload: 2.2,
        territory: faction === 'raiders' ? 360 : 200, confirm: .6, signal: false, armor: 0, ...patch });
}
export const ENEMY_ARCHETYPES = Object.freeze({
    'raider-melee': define('raider-melee', '近身掠夺者', 'raiders', 'scav', 'melee', 'club', 56, 69, 11, 38),
    'raider-gunner': define('raider-gunner', '拾荒枪手', 'raiders', 'salt', 'projectile', 'pistol', 68, 54, 10, 260),
    'raider-lookout': define('raider-lookout', '望风者', 'raiders', 'scav', 'projectile', 'pistol', 44, 78, 7, 210, { signal: true, vision: 340, windup: .9 }),
    'raider-boss': define('raider-boss', '盐枭头目', 'raiders', 'elite', 'projectile', 'shotgun', 120, 48, 22, 190, { signal: true, armor: .2 }),
    'tidal-crab': define('tidal-crab', '潮蚀蟹', 'fauna', 'creature', 'melee', 'claw', 70, 38, 16, 42, { windup: .85, armor: .3, territory: 130 }),
    'saltback-dog': define('saltback-dog', '盐背犬', 'fauna', 'creature', 'pounce', 'claw', 42, 92, 12, 110, { windup: .7, recovery: 1.2 }),
    'sac-spitter': define('sac-spitter', '囊腹喷吐兽', 'fauna', 'creature', 'spit', 'claw', 68, 40, 15, 210, { windup: 1.1, recovery: 1.6 }),
    'salt-dazed': define('salt-dazed', '失神盐蚀者', 'affected', 'scav', 'melee', 'claw', 62, 46, 10, 36),
    'tide-chaser': define('tide-chaser', '追潮者', 'affected', 'salt', 'pounce', 'claw', 72, 85, 14, 120, { windup: .8, recovery: 1.4 }),
    'tide-ritualist': define('tide-ritualist', '守潮执仪者', 'affected', 'elite', 'melee', 'club', 85, 48, 17, 64, { stance: 'conditional', signal: true, windup: .8 }),
    'salt-hulk': define('salt-hulk', '盐壳重躯', 'affected', 'elite', 'melee', 'claw', 160, 29, 28, 62, { windup: 1.3, recovery: 1.7, armor: .4, territory: 150 }),
    'mercenary-scout': define('mercenary-scout', '侦察兵', 'mercenaries', 'salt', 'projectile', 'rifle', 75, 78, 11, 320, { signal: true, vision: 360 }),
    'mercenary-assault': define('mercenary-assault', '突击兵', 'mercenaries', 'elite', 'projectile', 'rifle', 100, 62, 13, 300, { armor: .2, magazine: 9 }),
    'mercenary-support': define('mercenary-support', '支援枪手', 'mercenaries', 'elite', 'projectile', 'rifle', 95, 43, 10, 360, { magazine: 15, windup: .9, recovery: .25 }),
    'recovery-leader': define('recovery-leader', '回收队长', 'mercenaries', 'elite', 'projectile', 'rifle', 115, 56, 12, 300, { signal: true, armor: .2 }),
    'blockade-sentry': define('blockade-sentry', '检查哨兵', 'blockade', 'salt', 'projectile', 'rifle', 85, 52, 12, 300),
    'blockade-patrol': define('blockade-patrol', '巡逻队员', 'blockade', 'salt', 'projectile', 'rifle', 85, 64, 11, 280, { signal: true }),
    'blockade-sergeant': define('blockade-sergeant', '检查站班长', 'blockade', 'elite', 'projectile', 'rifle', 110, 52, 13, 320, { signal: true, armor: .15 }),
});
export type ArchetypeId = keyof typeof ENEMY_ARCHETYPES;
export function archetype(id: string): Readonly<Archetype> | undefined {
    return typeof id === 'string' && Object.hasOwn(ENEMY_ARCHETYPES, id) ? ENEMY_ARCHETYPES[id as ArchetypeId] : undefined;
}
export function enemyDefinition(id: string): Readonly<EnemyDef> {
    const def = archetype(id) ?? (Object.hasOwn(ENEMIES, id) ? ENEMIES[id] : undefined);
    if (!def) throw new RangeError(`Unknown enemy ID: ${id}`);
    return def;
}

/** Actor capability v2. Unknown program kinds/armaments fail closed in the save reader.
 * Armament is the actual carried weapon, not an independent presentation choice. */
export type EnemyProgram = { kind: 'affected'; armament: 'unarmed' | 'polearm' | 'rifle' }
    | { kind:'recovery'; leader:string; crate:string; phase:'collect'|'loading'|'advance'|'delivered'|'withdraw'; leg:0|1|2; since:number; heardAt:number }
    | { kind:'blockade'; leader:string; phase:'none'|'waiting'|'granted'|'engaged'; waited:number; since:number };
const AFFECTED_DAZED = Object.freeze({ ...ENEMY_ARCHETYPES['salt-dazed'], confirm: 1.2 });
const AFFECTED_HULK = Object.freeze({ ...ENEMY_ARCHETYPES['salt-hulk'], confirm: 1.6, vision: 180 });
const RITUALIST_RIFLE: Readonly<Archetype> = Object.freeze({ ...ENEMY_ARCHETYPES['tide-ritualist'], attack: 'projectile', weapon: 'rifle',
    damage: 12, range: 240, magazine: 4, reserve: 8, reload: 2.4, recovery: .8 });
const RECOVERY_RULES:Readonly<Record<string,Readonly<Archetype>>> = Object.freeze(Object.fromEntries(
    (['mercenary-scout','mercenary-assault','mercenary-support','recovery-leader'] as const)
        .map(id=>[id,Object.freeze({...ENEMY_ARCHETYPES[id],territory:600})])));
/** All controller, projectile, save and view consumers resolve one persisted armament here.
 * Existing v1 actors retain their original definitions and confirmation times. */
export function actorArchetype(actor: { id: string; tactics?: EnemyTactics }): Readonly<Archetype> | undefined {
    const def = archetype(actor.id), t = actor.tactics;
    if (t?.version !== 2) return def;
    if (t.program?.kind === 'recovery' && Object.hasOwn(RECOVERY_RULES,actor.id)) return RECOVERY_RULES[actor.id];
    if (t.program?.kind !== 'affected') return def;
    if (actor.id === 'salt-dazed') return AFFECTED_DAZED;
    if (actor.id === 'salt-hulk') return AFFECTED_HULK;
    return actor.id === 'tide-ritualist' && t.program.armament === 'rifle' ? RITUALIST_RIFLE : def;
}
export function actorDefinition(actor: { id: string; tactics?: EnemyTactics }): Readonly<EnemyDef> {
    return actorArchetype(actor) ?? enemyDefinition(actor.id);
}
/** The same visible permission boundary feeds perception and presentation. A working convoy warns
 * around its actual bodies; historical conditional guards keep their original fixed home boundary. */
export function enemyBoundary(actor:Point&{id:string;home:Point;tactics?:EnemyTactics}):{at:Point;radius:number}|null {
    if(actorArchetype(actor)?.stance!=='conditional')return null;
    const t=actor.tactics,mobile=t?.version===2&&t.program.kind==='recovery';
    return {at:mobile?{x:actor.x,y:actor.y}:{...actor.home},radius:mobile?64:90};
}

/** Authored raid v4/v5 only. All times are simulation seconds; points are current-map world pixels.
 * Memory is observed information, never a live target pointer. Phase/locked aim and ammunition survive refresh.
 * signalUsed is a once-per-action latch. Equipment and supplies are the sole source of corpse contents. */
interface EnemyTacticsCore {
    squad: string;
    awareness: number; stance: 'idle' | 'warning' | 'hostile' | 'retreat'; warning: number;
    memory: { at: Point; time: number; source: 'sight' | 'sound' | 'report' | 'damage'; target: string } | null;
    phase: 'idle' | 'windup' | 'release' | 'recovery' | 'reload'; phaseLeft: number; lockedAim: number;
    magazine: number; reserve: number; signalUsed: boolean;
    equipment: string | null; supplies: { id: string; qty: number }[];
    killedBy: string | null;
}
export type EnemyTactics = EnemyTacticsCore & ({ version: 1 } | { version: 2; program: EnemyProgram });
export function initialTactics(id: string, squad: string, program?: EnemyProgram): EnemyTactics {
    if (program && (program.kind === 'affected' ? archetype(id)?.faction !== 'affected'
        || (id === 'tide-ritualist' ? !['rifle', 'polearm'].includes(program.armament) : program.armament !== 'unarmed')
        : program.kind === 'recovery' ? archetype(id)?.faction !== 'mercenaries'
        : program.kind !== 'blockade' || archetype(id)?.faction !== 'blockade'))
        throw new RangeError(`Invalid enemy program: ${id}`);
    const def = actorArchetype({ id, ...(program ? { tactics: { version: 2, program } as EnemyTactics } : {}) });
    if (!def) throw new RangeError(`Unknown archetype: ${id}`);
    return { ...(program ? { version: 2 as const, program: { ...program } } : { version: 1 as const }), squad, awareness: 0, stance: 'idle', warning: 0, memory: null,
        phase: 'idle', phaseLeft: 0, lockedAim: 0, magazine: def.magazine, reserve: def.reserve, signalUsed: false,
        equipment: def.attack === 'projectile' ? def.weapon === 'rifle' ? 'carbine' : def.weapon : null,
        supplies: [{ id: def.faction === 'fauna' ? 'food' : 'bandage', qty: 1 }], killedBy: null };
}
