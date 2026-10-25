import type { EnemyState } from './checkpoint';
import { archetype } from './enemy-archetypes';

/** Relationships of authored actors only. Legacy enemies keep their shipped player-only rules.
 * Mercenaries and the blockade are neutral to each other. Animals and uncontrolled affected people
 * defend their own territory; sharing a category does not put them under human squad command. */
export function enemyRelation(a: EnemyState, b: EnemyState): 'friendly' | 'hostile' | 'neutral' {
    const left = archetype(a.id), right = archetype(b.id);
    if (!left || !right) return 'neutral';
    if (left.faction === right.faction) {
        if (left.faction === 'fauna') return a.id === b.id && a.tactics?.squad === b.tactics?.squad ? 'friendly' : 'neutral';
        if (left.faction === 'affected') return left.stance === 'conditional' && right.stance === 'conditional' ? 'friendly' : 'neutral';
        return 'friendly';
    }
    const armedRival = (faction: string) => faction === 'mercenaries' || faction === 'blockade';
    return left.faction === 'raiders' && armedRival(right.faction) || right.faction === 'raiders' && armedRival(left.faction) ? 'hostile' : 'neutral';
}

/** Friendly and legacy bodies stop authored NPC attacks without taking damage. Neutral authored
 * bodies can be injured accidentally and retaliate against the actual attacker, never the player by proxy. */
export function canDamageEnemy(attacker: EnemyState, target: EnemyState): boolean {
    return attacker.uid !== target.uid && !!attacker.tactics && !!target.tactics && enemyRelation(attacker, target) !== 'friendly';
}

export function canReceiveReport(sender: EnemyState, receiver: EnemyState): boolean {
    const a = archetype(sender.id), b = archetype(receiver.id);
    return !!a && !!b && a.faction !== 'fauna' && (a.faction !== 'affected' || b.stance === 'conditional')
        && a.faction === b.faction && sender.tactics?.squad === receiver.tactics?.squad && enemyRelation(sender, receiver) === 'friendly';
}

