/** Compatibility presentation/combat categories only. Never reinterpret an old save as a new design archetype. */
export interface LegacyEnemyProfile {
    readonly bodyKind: 'scav' | 'salt' | 'creature' | 'elite';
    readonly weapon: 'club' | 'rifle' | 'claw';
    readonly attack: 'melee' | 'projectile';
    readonly corpseLootRolls: 1 | 3;
}
export const LEGACY_ENEMY_PROFILES = Object.freeze({
    scav: Object.freeze({ bodyKind: 'scav', weapon: 'club', attack: 'melee', corpseLootRolls: 1 } satisfies LegacyEnemyProfile),
    salt: Object.freeze({ bodyKind: 'salt', weapon: 'rifle', attack: 'projectile', corpseLootRolls: 1 } satisfies LegacyEnemyProfile),
    creature: Object.freeze({ bodyKind: 'creature', weapon: 'claw', attack: 'melee', corpseLootRolls: 1 } satisfies LegacyEnemyProfile),
    elite: Object.freeze({ bodyKind: 'elite', weapon: 'rifle', attack: 'projectile', corpseLootRolls: 3 } satisfies LegacyEnemyProfile),
});
export type LegacyEnemyId = keyof typeof LEGACY_ENEMY_PROFILES;

/** Reject unknown keys, including Object.prototype names. Catalog IDs deliberately do not pass this boundary. */
export function getLegacyEnemyProfile(id: string): Readonly<LegacyEnemyProfile> {
    if (!Object.hasOwn(LEGACY_ENEMY_PROFILES, id)) throw new RangeError(`Unknown legacy enemy ID: ${id}`);
    return LEGACY_ENEMY_PROFILES[id as LegacyEnemyId];
}
