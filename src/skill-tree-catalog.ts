/** Issue #143 local research catalog. Not installed in a SessionRecord or the live game's Perk selection. */
export const SKILL_BRANCHES = ['combat', 'survival', 'search'] as const;
export type SkillBranch = typeof SKILL_BRANCHES[number];
type Definition = { id: string; branch: SkillBranch; tier: 0 | 5 | 10; max: 1 | 3; perRank: number; cost?: 2; exclusive?: 'junction' };
/** Stable IDs and numeric benefits have one owner. Ratios are relative reductions, not percentage-point changes. */
export const SKILLS = [
    { id: 'combat-grip', branch: 'combat', tier: 0, max: 3, perRank: .04 },
    { id: 'combat-reload', branch: 'combat', tier: 0, max: 3, perRank: .04 },
    { id: 'combat-aim', branch: 'combat', tier: 0, max: 3, perRank: .05 },
    { id: 'combat-melee', branch: 'combat', tier: 5, max: 3, perRank: .06 },
    { id: 'combat-burst', branch: 'combat', tier: 5, max: 3, perRank: .05 },
    { id: 'combat-move', branch: 'combat', tier: 5, max: 3, perRank: .05 },
    { id: 'combat-break', branch: 'combat', tier: 10, max: 1, perRank: .20 },
    { id: 'combat-ambush', branch: 'combat', tier: 10, max: 1, perRank: .10 },
    { id: 'survival-breath', branch: 'survival', tier: 0, max: 3, perRank: .04 },
    { id: 'survival-heal', branch: 'survival', tier: 0, max: 3, perRank: .05 },
    { id: 'survival-needs', branch: 'survival', tier: 0, max: 3, perRank: .04 },
    { id: 'survival-clot', branch: 'survival', tier: 5, max: 3, perRank: .05 },
    { id: 'survival-environment', branch: 'survival', tier: 5, max: 3, perRank: .05 },
    { id: 'survival-calm', branch: 'survival', tier: 5, max: 3, perRank: .05 },
    { id: 'survival-emergency', branch: 'survival', tier: 10, max: 1, perRank: .30 },
    { id: 'survival-respite', branch: 'survival', tier: 10, max: 1, perRank: .30 },
    { id: 'search-carry', branch: 'search', tier: 0, max: 3, perRank: 1 },
    { id: 'search-notice', branch: 'search', tier: 0, max: 3, perRank: .08 },
    { id: 'search-tags', branch: 'search', tier: 0, max: 3, perRank: 1 },
    { id: 'search-step', branch: 'search', tier: 5, max: 3, perRank: .06 },
    { id: 'search-quiet', branch: 'search', tier: 5, max: 3, perRank: .04 },
    { id: 'search-scrap', branch: 'search', tier: 5, max: 3, perRank: .05 },
    { id: 'search-finds', branch: 'search', tier: 10, max: 1, perRank: 1 },
    { id: 'search-pack', branch: 'search', tier: 10, max: 1, perRank: .10 },
    // Append-only catalog order preserves the original research selections' canonical ordering.
    { id: 'combat-recovery', branch: 'combat', tier: 0, max: 3, perRank: .05 },
    { id: 'combat-hipfire', branch: 'combat', tier: 0, max: 3, perRank: .03 },
    { id: 'combat-switch', branch: 'combat', tier: 0, max: 3, perRank: .06 },
    { id: 'combat-flinch', branch: 'combat', tier: 5, max: 3, perRank: .06 },
    { id: 'combat-execute', branch: 'combat', tier: 5, max: 3, perRank: .04 },
    { id: 'combat-steady-step', branch: 'combat', tier: 5, max: 3, perRank: .04 },
    { id: 'combat-auto-feed', branch: 'combat', tier: 5, max: 1, perRank: 1, cost: 2, exclusive: 'junction' },
    { id: 'combat-field-press', branch: 'combat', tier: 5, max: 1, perRank: 2, cost: 2, exclusive: 'junction' },
    { id: 'survival-stamina', branch: 'survival', tier: 0, max: 3, perRank: 4 },
    { id: 'survival-metabolism', branch: 'survival', tier: 0, max: 3, perRank: .04 },
    { id: 'survival-pain', branch: 'survival', tier: 0, max: 3, perRank: .05 },
    { id: 'survival-coagulation', branch: 'survival', tier: 5, max: 3, perRank: .04 },
    { id: 'survival-recovery', branch: 'survival', tier: 5, max: 3, perRank: .05 },
    { id: 'survival-grit', branch: 'survival', tier: 5, max: 3, perRank: .02 },
    { id: 'survival-regeneration', branch: 'survival', tier: 5, max: 1, perRank: 1, cost: 2, exclusive: 'junction' },
    { id: 'survival-auto-aid', branch: 'survival', tier: 5, max: 1, perRank: 10, cost: 2, exclusive: 'junction' },
    { id: 'search-container-limit', branch: 'search', tier: 0, max: 3, perRank: 1 },
    { id: 'search-light-meds', branch: 'search', tier: 0, max: 3, perRank: .03 },
    { id: 'search-overweight-stamina', branch: 'search', tier: 0, max: 3, perRank: .04 },
    { id: 'search-memory', branch: 'search', tier: 5, max: 3, perRank: 1 },
    { id: 'search-scout', branch: 'search', tier: 5, max: 3, perRank: .02 },
    { id: 'search-route-efficiency', branch: 'search', tier: 5, max: 3, perRank: .03 },
    { id: 'search-auto-salvage', branch: 'search', tier: 5, max: 1, perRank: 1, cost: 2, exclusive: 'junction' },
    { id: 'search-field-scan', branch: 'search', tier: 5, max: 1, perRank: 1, cost: 2, exclusive: 'junction' },
] as const satisfies readonly Definition[];
export type SkillId = typeof SKILLS[number]['id'];
export function skillDefinition(id: unknown) {
    const found = typeof id === 'string' ? SKILLS.find(s => s.id === id) : undefined;
    return found ? { ...found, cost: 'cost' in found ? found.cost : 1,
        exclusive: found.tier === 10 ? 'specialization' as const : 'exclusive' in found ? found.exclusive : null } : undefined;
}
