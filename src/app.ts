import type { ShopCart } from './shop';
import type Phaser from 'phaser';
import type { RaidScene } from './game';
import type { SaveDataV1 } from './domain';
import { SynthAudio } from './audio';
import { createSessionState, SaveSession } from './session';
import type { SessionRecord } from './recovery-store';
import type { BaseScene } from './base-scene';

/** Browser composition root. The session never imports this module or the UI. */
export const app = {
    ...createSessionState(),
    game: null as Phaser.Game | null,
    raid: null as RaidScene | null,
    base: null as BaseScene | null,
    /** Opt-in Pixi village sample host (?sample=village); while set, the Phaser RaidScene is never started. */
    coastSample: null as { checkpoint(): boolean } | null,
    baseWalking: false, baseFacility: 'rest', mapView: '',
    tab: 'gear', overlay: '', helpReturn: '', selected: '', selectedSource: '', seed: '',
    runWorld: 'coast' as 'coast' | 'buildings' | 'mall',
    lootContext: null as { containerId: string; runId: string } | null,
    mobileContainer: 'bag', runContainer: 'bag', inventoryGrid: false, placement: false, placementRotated: undefined as boolean | undefined, placementQuantity: undefined as number | undefined,
    reading: null as { title: string; text: string } | null,
    pendingImport: null as SaveDataV1 | null,
    pendingRecoveryImport: null as SessionRecord | null,
    menuMotion: true,
    selectedExit: '', tasksExpanded: false,
    shop: null as ShopCart | null,
    shopLeave: null as { action: 'tab' | 'deploy' | 'menu' | 'base-enter' | 'base-return'; id: string } | null,
};

export const audio = new SynthAudio();
export const saveSession = new SaveSession(app, () => localStorage);
