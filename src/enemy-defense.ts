import { archetype } from './enemy-archetypes';
import type { Point } from './world';

/** New shell armour has a 120-degree protected front. Source is the actual incoming segment/strike,
 * never a shooter's later position. Human equipment protects all sides; old IDs have no new modifier. */
export function enemyDamageAfterArmor(enemy: Point & { id: string; rotation: number }, source: Point, amount: number,
    incomingAngle = Math.atan2(source.y - enemy.y, source.x - enemy.x)): number {
    const def = archetype(enemy.id);
    if (!def?.armor) return amount;
    const incoming = incomingAngle - enemy.rotation;
    const front = Math.abs(Math.atan2(Math.sin(incoming), Math.cos(incoming))) <= Math.PI / 3;
    const protectedSide = !['tidal-crab', 'salt-hulk'].includes(enemy.id) || front;
    return amount * (protectedSide ? 1 - def.armor : 1);
}
