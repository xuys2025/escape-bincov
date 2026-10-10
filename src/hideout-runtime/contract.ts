/** Durable water-station contract, based on the approved prototype contract (2026-10-09).
 * Presentation, animation, pathfinding and assets belong to the host. No mock settlement exists here.
 */
import type { Inventory, RunSummary, SaveDataV1 } from '../domain';
import type { Attribute, Facility } from '../expansion-state';
export type { Attribute, Facility } from '../expansion-state';
export type Recipe = 'bandage' | 'medkit' | 'antidote';
export type Source = 'stash' | 'bag' | 'safe';
export type ShopSource = 'merchant' | 'buy' | 'sell' | 'stash';
export type Merchant = 'arms' | 'med';
export type Power = 'emergency' | 'restored';
export type RunWorld = 'coast' | 'buildings' | 'mall';
export type FailReason = 'rule' | 'space' | 'funds' | 'materials' | 'locked' | 'stale' | 'storage' | 'conflict';
export type Result = { ok: true; message?: string } | { ok: false; reason: FailReason; message: string;
    confirmation?: { kind: 'quest-sale'; token: string; warnings: string[] } };
export interface BatchView { id: string; recipe: Recipe; duration: number; remaining: number; result: { id: string; qty: number }[] }
export interface BaseView {
    facilities: Record<Facility, number>; queue: BatchView[]; completed: BatchView[];
    training: { attribute: Attribute | null; activeSeconds: number; quantity: number; windowLeft: number }; extractedPearl: boolean;
}
export interface BodyView {
    hp: number; hpMax: number; stamina: number; staminaMax: number; mental: number; water: number; satiety: number; pollution: number;
    bleeding: boolean; effects: { name: string; seconds: number }[];
    attributes: Record<Attribute, { base: number; effective: number; progress: number }>; carry: number;
}
export interface HideoutSnapshot {
    /** Actual durable session revision, also observes transactions made through the old tabs. */
    rev: number; profile: Readonly<SaveDataV1>; base: BaseView; body: BodyView; power: 'emergency' | 'restored';
    storage: { ok: boolean; conflict: boolean; pendingSettlement: boolean; pendingBase: boolean; upgradeRequired: boolean };
    /** Log sequence derived from run count, not a new day/night clock. */
    day: number; phase: 'menu' | 'hideout' | 'departing' | 'run' | 'result';
    arrival: { runId: string; summary: RunSummary } | null;
}
export interface CartView {
    merchant: Merchant; name: string; subtitle: string; catalog: Inventory; buy: Inventory; sell: Inventory; stash: Inventory;
    totals: { buy: number; sell: number; net: number }; dirty: boolean; warnings: string[];
    /** Buy slots are a shopping list; existing rules auto-place purchases into the stash. */
    placement: 'automatic-stash';
}
export interface ShopSession {
    view(): CartView;
    placementError(from: ShopSource, to: ShopSource, uid: string, x: number, y: number): string | null;
    place(from: ShopSource, to: ShopSource, uid: string, x: number, y: number): Result;
    settle(confirmation?: string): Result;
    reset(): void;
}
export interface FacilityInfo {
    id: Facility; name: string; level: number; maxLevel: number; explanation: string;
    cost: { cash: number; items: { id: string; qty: number; have: number }[] } | null; locked: string | null;
}
export type HideoutEvent =
    | { type: 'committed'; rev: number; action: string }
    | { type: 'power-restored' }
    | { type: 'facility-built'; facility: Facility; level: number }
    | { type: 'production-complete'; batch: string }
    | { type: 'practice-credited'; attribute: Attribute; amount: number }
    | { type: 'save-failed'; action: string };
/** Position/time input replaces unverified moved/inZone claims. World pixels; clock is epoch milliseconds. */
export interface PracticeSample { from: { x: number; y: number }; to: { x: number; y: number }; seconds: number; now: number }
export interface HideoutRuntime {
    /** At the station boundary only: atomically upgrade existing progress; active legacy raids must resume first. */
    enter(): Result;
    snapshot(): HideoutSnapshot;
    subscribe(fn: (event: HideoutEvent) => void): () => void;
    /** Real-time queue/recovery checkpoint every five seconds; no raid simulation. */
    tick(nowMs: number): void;
    setActivity(active: boolean): void;
    placementError(from: Source, to: Source, uid: string, x: number, y: number, rotated: boolean, quantity?: number): string | null;
    move(from: Source, to: Source, uid: string, x: number, y: number, rotated: boolean, quantity?: number): Result;
    split(from: Source, uid: string, quantity: number, x: number, y: number, rotated?: boolean): Result;
    quickMove(from: Source, uid: string): Result;
    secure(from: Source, uid: string): Result;
    equip(from: Source, uid: string): Result;
    unequip(): Result;
    useSupply(from: Source, uid: string): Result;
    equipCharm(from: Source, uid: string): Result;
    unequipCharm(): Result;
    upgradeStash(): Result;
    claimRelief(): Result;
    openShop(merchant: Merchant): ShopSession;
    submitQuest(id: string): Result;
    facility(id: Facility): FacilityInfo;
    build(id: Facility): Result;
    enqueue(recipe: Recipe): Result;
    cancel(batchId: string): Result;
    claim(batchId: string, target: Source): Result;
    selectPractice(attribute: Attribute): Result;
    practice(sample: PracticeSample): void;
    retrySave(): Result;
    exportBackup(): string;
    /** Explicit confirmation binds the exact file text; no import is committed by a preview. */
    previewImport(text: string): Result & { token?: string };
    importBackup(text: string, token: string): Result;
    setVolume(volume: number): Result;
    departure(): { warnings: string[]; weight: number; carry: number };
    deploy(req: { world: RunWorld; seed: string }): Result & { runId?: string };
    /** After the host's departure animation; never calls beginRun again. */
    startRaid(runId: string): Result;
    returnToBase(): Result;
    consumeArrival(): HideoutSnapshot['arrival'];
    /** Flush before changing hosts, opening old walking mode or leaving the page. */
    flush(): Result;
    backToMenu(): Result;
    dispose(): Result;
}
