/** Chapter 1 facts, independent of rendering. No clock, storage, reward ledger or inferred NPC knowledge. */
import * as D from './domain';
import type { LayeredRaid } from './expansion-state';

export const STORY_WORLD = 'coast-story-v1';
export const STORY_LAYOUT = 'market-layout-1';
export const STORY_CABINET = 'ch01-sc-toolcab';
export const STORY_CLUES = ['breaker-down', 'freezer-knocks', 'heard-call'] as const;
export type StoryClue = typeof STORY_CLUES[number];
export const STORY_CUES = ['ch01-sc-freezer', 'ch01-sc-call'] as const;
export type StoryCueId = typeof STORY_CUES[number];
export interface StoryState {
    version: 1;
    completedNodes: ('ch01-n01' | 'ch01-n02')[];
    clues: StoryClue[];
    choices: { call: 'unselected' | 'defer' | 'told' };
    memory: { xiaocai: { breakerReported: boolean } };
    currentRun: { runId: string; worldVersion: typeof STORY_WORLD; mapId: 'coast'; cues: StoryCueId[] } | null;
}
export function newStory(profile: D.SaveDataV1): StoryState {
    return { version: 1, completedNodes: profile.quests.repair ? ['ch01-n01', 'ch01-n02'] : [], clues: [],
        choices: { call: 'unselected' }, memory: { xiaocai: { breakerReported: false } }, currentRun: null };
}
/** Derived completion only. This never grants a reward or manufactures an observation. */
export function syncStory(story: StoryState, profile: D.SaveDataV1, raid: LayeredRaid | null): StoryState {
    const copy = structuredClone(story);
    copy.completedNodes = profile.quests.repair ? ['ch01-n01', 'ch01-n02'] : [];
    if (!raid || raid.worldVersion !== STORY_WORLD) copy.currentRun = null;
    return copy;
}
const exact = (v: any, keys: string[]) => v && typeof v === 'object' && !Array.isArray(v)
    && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k));
const members = (v: any, allowed: readonly string[]) => Array.isArray(v) && v.length <= allowed.length
    && new Set(v).size === v.length && v.every(x => allowed.includes(x));
/** Reject malformed/contradictory facts instead of silently normalizing an imported story. */
export function validateStory(value: unknown, profile: D.SaveDataV1, raid: LayeredRaid | null): StoryState {
    const s: any = value;
    const invalid = (): never => { throw new Error('剧情记录无效，原存档未被覆盖。'); };
    if (!exact(s, ['version', 'completedNodes', 'clues', 'choices', 'memory', 'currentRun']) || s.version !== 1
        || !members(s.clues, STORY_CLUES) || JSON.stringify(s.completedNodes) !== JSON.stringify(newStory(profile).completedNodes)
        || !exact(s.choices, ['call']) || !['unselected', 'defer', 'told'].includes(s.choices.call)
        || !exact(s.memory, ['xiaocai']) || !exact(s.memory.xiaocai, ['breakerReported']) || typeof s.memory.xiaocai.breakerReported !== 'boolean') return invalid();
    if (s.memory.xiaocai.breakerReported && !s.clues.includes('breaker-down')
        || s.choices.call !== 'unselected' && !s.clues.includes('heard-call')) return invalid();
    if (raid?.worldVersion === STORY_WORLD) {
        const run = s.currentRun;
        if (raid.layoutRevision !== STORY_LAYOUT || !exact(run, ['runId', 'worldVersion', 'mapId', 'cues'])
            || run.runId !== raid.runId || run.runId !== profile.activeRun?.runId || run.worldVersion !== STORY_WORLD
            || run.mapId !== 'coast' || !members(run.cues, STORY_CUES)
            || run.cues.includes('ch01-sc-freezer') && !s.clues.includes('freezer-knocks')
            || run.cues.includes('ch01-sc-call') && !s.clues.includes('heard-call')) return invalid();
    } else if (s.currentRun !== null) return invalid();
    return structuredClone(s);
}
export function startStoryRun(story: StoryState, runId: string): StoryState {
    return { ...structuredClone(story), currentRun: { runId, worldVersion: STORY_WORLD, mapId: 'coast', cues: [] } };
}
/** Called only after the Runtime validates the actual source, range, line of sight and active run. */
export function observeStory(story: StoryState, clue: StoryClue, cue?: StoryCueId): boolean {
    if (!story.currentRun || cue && story.currentRun.cues.includes(cue)) return false;
    const fresh = !story.clues.includes(clue);
    if (fresh) story.clues.push(clue);
    if (cue) story.currentRun.cues.push(cue);
    return fresh || !!cue;
}
export function repairDeficit(profile: D.SaveDataV1): Record<'scrap' | 'wire' | 'fuse', number> {
    return Object.fromEntries(Object.entries(D.QUESTS.repair.needs).map(([id, need]) => [id, profile.quests.repair ? 0
        : Math.max(0, need - [profile.stash, profile.bag, profile.safe].reduce((n, inv) => n + inv.items.filter(i => i.id === id).reduce((sum, i) => sum + i.qty, 0), 0))])) as Record<'scrap' | 'wire' | 'fuse', number>;
}
export const STORY_RECALL: Record<StoryClue, { title: string; text: string; source: string }> = {
    'breaker-down': { title: '市场总闸', text: '总闸已经拉下，闸柄上结着盐。箱门开着，旁边没有人。', source: '市场配电区' },
    'freezer-knocks': { title: '冷柜响动', text: '冷柜响了两下，又停了。', source: '旧交易厅' },
    'heard-call': { title: '配电区的喊声', text: '“拉闸……水上来了……”配电区里没有人。', source: '市场配电区' },
};
/** Detached projection; callers may render or discard it freely. Reading does not observe anything. */
export function storyView(story: StoryState, profile: D.SaveDataV1, loadout?: D.RunLoadout | null) {
    const owned = loadout ? { ...profile, bag: loadout.bag, safe: loadout.safe } : profile;
    return { power: profile.quests.repair ? 'restored' as const : 'emergency' as const,
        completedNodes: [...story.completedNodes], deficit: repairDeficit(owned),
        canSubmit: !profile.activeRun && !profile.quests.repair && Object.values(repairDeficit(owned)).every(n => n === 0),
        breakerReported: story.memory.xiaocai.breakerReported, callChoice: story.choices.call,
        recall: story.clues.map(id => ({ id, ...STORY_RECALL[id] })) };
}
