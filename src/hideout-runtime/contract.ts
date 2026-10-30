/** Durable water-station contract, based on the approved prototype contract (2026-10-09).
 * Presentation, animation, pathfinding and assets belong to the host. No mock settlement exists here.
 */
import type { PresetNode } from '../gunsmith/presets';
import type { Inventory, Item, ItemKind, RunSummary, SaveDataV1 } from '../domain';
import type { Attribute, Facility } from '../expansion-state';
import type { PerkId, PerkModifiers, PerkTier } from '../perks';
import type { GunEdit, GunEditPreview, GunPlace } from '../gunsmith/edit';
import type { GunState } from '../gunsmith/instance';
export type { Attribute, Facility } from '../expansion-state';
export type { PerkId, PerkModifiers, PerkTier } from '../perks';
export type { GunEdit, GunEditPreview, GunPlace } from '../gunsmith/edit';
export type Recipe = 'bandage' | 'medkit' | 'antidote';
export type Source = 'stash' | 'bag' | 'safe';
export type ShopSource = 'merchant' | 'buy' | 'sell' | 'stash';
export type Merchant = 'arms' | 'med';
export type RunWorld = 'coast' | 'buildings' | 'mall';
export type FailReason = 'rule' | 'space' | 'funds' | 'materials' | 'locked' | 'stale' | 'storage' | 'conflict' | 'missing-item' | 'not-supply' | 'no-effect';
export type Result = { ok: true; message?: string } | { ok: false; reason: FailReason; message: string;
    confirmation?: { kind: 'quest-sale'; token: string; warnings: string[] } };
export interface BatchView { id: string; recipe: Recipe; duration: number; remaining: number; result: { id: string; qty: number }[] }
export interface BaseView {
    facilities: Record<Facility, number>; queue: BatchView[]; completed: BatchView[];
    training: { attribute: Attribute | null; activeSeconds: number; quantity: number; windowLeft: number }; extractedPearl: boolean;
}
/** Runtime-validated projection, never a saved reward. Reading neither advances the clock nor commits. */
export interface TrainingProgress {
    readonly attribute: Attribute | null;
    readonly saved: { readonly activeSeconds: number; readonly quantity: number };
    /** Effective seconds accepted by the original practice rule since the last successful commit. */
    readonly pendingSeconds: number;
    /** Remainder and quantity after applying those samples OR the retained failed candidate, exactly once. */
    readonly activeSeconds: number;
    readonly quantity: number;
    readonly pendingGrowth: Readonly<Record<Attribute, number>>;
    readonly windowLeft: number;
    readonly capped: boolean;
    readonly windowExpired: boolean;
    /** A validated sample started a new ten-minute window, still awaiting persistence. */
    readonly pendingWindow: boolean;
    readonly status: 'unavailable' | 'select' | 'ready' | 'capped' | 'storage' | 'conflict' | 'stale' | 'locked';
}
export interface BodyView {
    hp: number; hpMax: number; stamina: number; staminaMax: number; mental: number; water: number; satiety: number; pollution: number;
    bleeding: boolean; effects: { name: string; seconds: number }[];
    attributes: Record<Attribute, { base: number; effective: number; progress: number }>; carry: number;
}
export interface HideoutSnapshot {
    /** Actual durable session revision, also observes transactions made through the old tabs. */
    rev: number; profile: Readonly<SaveDataV1>; base: BaseView; body: BodyView; power: 'emergency' | 'restored';
    /** Detached view of the equipped item in the committed session; null when none is equipped. */
    readonly charm: Readonly<Item> | null;
    storage: { ok: boolean; reloadRequired: boolean; conflict: boolean; pendingSettlement: boolean; pendingBase: boolean; upgradeRequired: boolean };
    /** Log sequence derived from run count, not a new day/night clock. */
    day: number; phase: 'menu' | 'hideout' | 'departing' | 'run' | 'result';
    arrival: { runId: string; summary: RunSummary } | null;
}
export interface CartView {
    merchant: Merchant; name: string; subtitle: string; catalog: Inventory; buy: Inventory; sell: Inventory; stash: Inventory;
    totals: { buy: number; sell: number; net: number }; dirty: boolean; warnings: string[];
    /** The stash changed since opening; explicit reset discards the old list without writing the save. */
    stale: boolean;
    /** Buy slots are a shopping list; existing rules auto-place purchases into the stash. */
    placement: 'automatic-stash';
    /** What the catalog shows (#28 M2-08): a kind or all, only what fits the base's guns, the page of `pages`; `kinds` are the stock's. */
    browse: { kind: ItemKind | 'all'; fits: boolean; page: number; pages: number; kinds: ItemKind[] };
}
export interface ShopSession {
    view(): CartView;
    placementError(from: ShopSource, to: ShopSource, uid: string, x: number, y: number): string | null;
    place(from: ShopSource, to: ShopSource, uid: string, x: number, y: number): Result;
    settle(confirmation?: string): Result;
    reset(): void;
    /** Show another part of the catalog (#28 M2-08); the buy and sell lists and the stash stay as they are. */
    browse(view: { kind: ItemKind | 'all'; fits: boolean; page: number }): void;
}
/** The workbench for one gun (#28 M2-04), as openGunsmith returns it. Detached and read-only; reading writes nothing. */
export interface GunsmithView {
    /** The gun as committed, wherever the base holds it (equipped, stash, bag or safe); null once it has left the base. */
    gun: { uid: string; id: string; relief: boolean; where: GunPlace; state: GunState } | null;
    /** The edits of the preview below, in order; empty without one. */
    edits: GunEdit[];
    /** The latest preview the session accepted: the candidate and what it changes, or null. */
    preview: GunEditPreview | null;
    /** Confirms exactly that preview, once; null while it cannot be committed (preview.refusal says why) or is stale. */
    token: string | null;
    /** The equipped slot, stash, bag or safe changed since the preview: confirm refuses it; preview again. */
    stale: boolean;
}
/**
 * The workbench's edit transaction (#28 M2-04; rules in gunsmith/edit.ts planGunEdit), shaped like ShopSession: a
 * private preview the player builds, never written, then one commit. Only at the base, never during a raid.
 */
export interface GunsmithSession {
    view(): GunsmithView;
    /**
     * Work out `edits` on the committed state and make them the session's preview; never writes. An edit that cannot
     * be made (a part that does not fit, a part no longer there) is refused with its reason and its index (`edit`), and
     * the previous preview stays. A candidate that cannot be committed (a part not owned, no room in the stash, a gun
     * that would no longer fit where it lies, no change at all) is still previewed, with preview.refusal and no token.
     * Each preview that can be committed gets a new token and retires the one before.
     */
    preview(edits: readonly GunEdit[]): Result & { token?: string; preview?: GunEditPreview; edit?: number };
    /**
     * Commit the previewed edits in one write: they are planned again on the committed state, and the commit is
     * refused as `stale` when the token is not the latest preview's, when the equipped slot or a container changed
     * since the preview (the revision may move for base-time checkpoints and retries, which change neither), or when
     * the plan differs. A failed write changes nothing and keeps the preview and its token: once retrySave succeeds the
     * same confirm commits it, once. Success clears the session's preview.
     */
    confirm(token: string): Result;
    /** Drop the preview (cancel); nothing was written. */
    reset(): void;
}
export interface FacilityInfo {
    id: Facility; name: string; level: number; maxLevel: number; explanation: string;
    cost: { cash: number; items: { id: string; qty: number; have: number }[] } | null; locked: string | null;
}
/** Why a perk action cannot run now: the reason and message its call would answer. */
export interface PerkBlock { reason: FailReason; message: string }
/**
 * One node of the base perk board (docs/CRITICAL-PERK-DESIGN.md section 5), with both candidates in every state:
 * locked below its permanent level, open, or chosen. A chosen node changes only through the reset of its attribute.
 */
export type PerkNodeView = { attribute: Attribute; tier: PerkTier; options: readonly [PerkId, PerkId] }
    & ({ status: 'locked'; requires: number } | { status: 'open' } | { status: 'chosen'; id: PerkId });
export interface PerkAttributeView {
    /** The permanent integer level. Only it unlocks a node: never a training fraction or a dose. */
    permanent: number;
    /** Tiers 15, 20, 25 and 30, ascending. */
    nodes: PerkNodeView[];
    /** The reset of this attribute: its fee, the cash now, the perks it would remove, and why it cannot run now (or null). */
    reset: { cost: number; cash: number; chosen: PerkId[]; blocked: PerkBlock | null };
}
/** Detached and read-only: reading it writes nothing, emits nothing and issues no confirmation, also from an event listener. */
export interface PerkBoard {
    /** Why nothing can be chosen or reset now (raid, pending settlement, failed or pending base write, another window, station not yet upgraded), or null. */
    blocked: PerkBlock | null;
    attributes: Record<Attribute, PerkAttributeView>;
}
export interface PerkDelta { before: number; after: number }
/** What a choice or a reset changes. Its confirm commits exactly this, hp and stamina taken as they are at the commit. */
export interface PerkChange {
    /** The modifiers that change: the scope. */
    scope: (keyof PerkModifiers)[];
    /** perkModifiers of the whole selection before and after. */
    modifiers: { before: PerkModifiers; after: PerkModifiers };
    /** derivedLimits: hp, stamina and carry kg. */
    limits: Record<'hp' | 'stamina' | 'carry', PerkDelta>;
    /** hp and stamina now and after: a higher limit never refills them; a lower one cuts them to it, which is neither damage nor training. */
    body: Record<'hp' | 'stamina', PerkDelta>;
}
export interface PerkChoicePreview extends PerkChange { kind: 'choice'; id: PerkId; attribute: Attribute; tier: PerkTier }
export interface PerkResetPreview extends PerkChange {
    kind: 'reset'; attribute: Attribute;
    /** The fee and the cash it leaves. */
    cost: number; cash: PerkDelta;
    /** This attribute's perks, in catalog order; the other attributes keep theirs. */
    removed: PerkId[];
}
export type HideoutEvent =
    | { type: 'committed'; rev: number; action: string }
    | { type: 'power-restored' }
    | { type: 'facility-built'; facility: Facility; level: number }
    | { type: 'production-complete'; batch: string }
    | { type: 'practice-credited'; attribute: Attribute; amount: number }
    | { type: 'save-failed' | 'publish-failed'; action: string };
/** Position/time input replaces unverified moved/inZone claims. World pixels; clock is epoch milliseconds. */
export interface PracticeSample { from: { x: number; y: number }; to: { x: number; y: number }; seconds: number; now: number }
export interface HideoutRuntime {
    /** Upgrade at the station boundary, then persist eligible relief before entry; active legacy raids resume first. */
    enter(): Result;
    snapshot(): HideoutSnapshot;
    /** Detached, read-only effective training progress; base.training remains committed data. */
    trainingProgress(): TrainingProgress;
    subscribe(fn: (event: HideoutEvent) => void): () => void;
    /** Real-time queue/recovery checkpoint every five seconds; no raid simulation. */
    tick(nowMs: number): void;
    setActivity(active: boolean): void;
    placementError(from: Source, to: Source, uid: string, x: number, y: number, rotated: boolean, quantity?: number): string | null;
    move(from: Source, to: Source, uid: string, x: number, y: number, rotated: boolean, quantity?: number): Result;
    split(from: Source, uid: string, quantity: number, x: number, y: number, rotated?: boolean): Result;
    quickMove(from: Source, uid: string): Result;
    /** Move every bag item to the stash in one commit; equipment and safe contents are excluded. */
    stashAll(): Result;
    /** Merge matching relief/ordinary stacks and deterministically repack only the stash. */
    sortStash(): Result;
    secure(from: Source, uid: string): Result;
    equip(from: Source, uid: string): Result;
    unequip(): Result;
    useSupply(from: Source, uid: string): Result;
    equipCharm(from: Source, uid: string): Result;
    unequipCharm(): Result;
    upgradeStash(): Result;
    claimRelief(): Result;
    openShop(merchant: Merchant): ShopSession;
    /** The workbench for the gun whose item uid is `gun`, wherever it is at the base; any number may be open. */
    openGunsmith(gun: string): GunsmithSession;
    /**
     * Save a workbench preset (#28 M2-07, gunsmith/presets.ts): gun type `gun` and a part tree of catalog ids and slots,
     * named `name` (trimmed; null takes the default "M4A1 配装 1"). Refused past PRESET_LIMIT presets of the type, for a
     * name too long or empty, and for a tree validateBuild refuses. Base only, one commit; the new preset's id on success.
     */
    savePreset(gun: string, parts: PresetNode[], name?: string | null): Result & { id?: string };
    /** Give preset `id` a new name (same rules as savePreset). */
    renamePreset(id: string, name: string): Result;
    /** Remove preset `id`; the last one removed leaves the profile without the field. */
    deletePreset(id: string): Result;
    submitQuest(id: string): Result;
    facility(id: Facility): FacilityInfo;
    build(id: Facility): Result;
    enqueue(recipe: Recipe): Result;
    /** 老栓精工 (#28 M4-09): make premium part `id` on the spot (gunsmith/premium.ts craftPremium). */
    craftPremium(id: string): Result;
    cancel(batchId: string): Result;
    claim(batchId: string, target: Source): Result;
    selectPractice(attribute: Attribute): Result;
    practice(sample: PracticeSample): void;
    /** The perk board of the committed state, as the base would act on it now. */
    perkBoard(): PerkBoard;
    /**
     * Preview choosing perk `id`: the refusal choosePerk would give now, or what it changes and a one-use token. The
     * token binds the request, the profile and the perk facts shown (selection, permanent levels, limits), not what
     * base time moves: the five-second checkpoints between preview and confirm do not stale it. Only the latest perk
     * preview, of either kind, can be confirmed. A preview writes nothing.
     */
    previewPerk(id: string): Result & { token?: string; preview?: PerkChoicePreview };
    /**
     * Commit the previewed choice: free, base only, no hp or stamina refill, in effect once written. Refusals of the
     * page (raid, settlement, storage, another window) come first and keep the token; otherwise the attempt uses up the
     * token of this request. A used, replaced or outdated token answers `stale` and changes nothing. A failed write
     * keeps this exact candidate for retrySave, which commits it once; until then other writes wait and exportBackup
     * carries the candidate.
     */
    choosePerk(id: string, token: string): Result;
    /** Preview the 500-cash reset of one attribute's perks; as previewPerk. */
    previewPerkReset(attribute: Attribute): Result & { token?: string; preview?: PerkResetPreview };
    /** Pay, remove the attribute's perks and cut hp and stamina to the lower limits in one commit; otherwise as choosePerk. */
    resetPerks(attribute: Attribute, token: string): Result;
    retrySave(): Result;
    exportBackup(): string;
    /** Explicit confirmation binds the exact file text; no import is committed by a preview. */
    previewImport(text: string): Result & { token?: string };
    importBackup(text: string, token: string): Result;
    setVolume(volume: number): Result;
    departure(): { warnings: string[]; weight: number; carry: number };
    /** mallLayout defaults to 1 and only applies to a new mall raid. */
    deploy(req: { world: RunWorld; seed: string; mallLayout?: 1 | 2 | 3 | 4 }): Result & { runId?: string };
    /** After the host's departure animation; never calls beginRun again. */
    startRaid(runId: string): Result;
    returnToBase(): Result;
    consumeArrival(): HideoutSnapshot['arrival'];
    /** Flush before changing hosts (yard, tab page, raid) or leaving the page. */
    flush(): Result;
    backToMenu(): Result;
    dispose(): Result;
}
