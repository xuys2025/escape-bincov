import type { Texture } from 'pixi.js';
import type { ActorKind, Rect } from '../raid-runtime/contract';
import { Atlas } from './atlas';
import { WALK_FRAMES, paintActorFrame, paintArm, paintCorpse, paintMuzzle, paintWeapon, type WeaponArt } from './art/actors';
import { canvas, dithered, edge, rim, silhouette } from './art/paint';
import { blob, paintCrate, paintExitDecal, paintLoot, pixel } from './art/props';
import { solActorFrame, solCorpse, solWeapon, type SolArt } from './art/sol';
import { gunsmithArt } from '../art/gunsmith-hooks';

export const FADE_LEVELS = [1, .7, .45, .25, 0];
/** Held gunsmith pictures kept per view; the least recently drawn goes first (ART-SPEC 4.3). */
const HELD_LIMIT = 8;
type HeldArt = WeaponArt & { texture: Texture; rim: Texture; tip: { x: number; y: number }; keys: string[] };

export class Textures {
  readonly atlas = new Atlas();
  private canvases = new Map<string, HTMLCanvasElement>();
  private weapons = new Map<string, WeaponArt>();
  /** Held gunsmith pictures (#28 M2-10), most recent last: at most HELD_LIMIT per view (ART-SPEC 4.3). */
  private held = new Map<string, HeldArt>();
  /**
   * Sol samples, or null for the procedural placeholders (?art=placeholder). `release` frees the GPU slots of textures
   * dropped while the view lives (renderer-lifetime.ts releaseManagedSlots).
   */
  constructor(readonly art: SolArt | null = null, private release: (uids: number[]) => void = () => {}) {}

  ensure(key: string, paint: () => HTMLCanvasElement): Texture {
    if (!this.atlas.has(key)) { const c = paint(); this.canvases.set(key, c); this.atlas.add(key, c); }
    return this.atlas.get(key);
  }
  canvas(key: string): HTMLCanvasElement { const c = this.canvases.get(key); if (!c) throw new Error(`Missing canvas: ${key}`); return c; }

  faded(key: string, level: number, keepBottom: number, ox = 0, oy = 0): Texture {
    if (level <= 0) return this.atlas.get(key);
    const k = `${key}|f${level}|${keepBottom}|${ox & 3},${oy & 3}`;
    return this.ensure(k, () => dithered(this.canvas(key), FADE_LEVELS[level], keepBottom, ox, oy));
  }
  /**
   * An indoor wall piece (wall-display.ts), never dithered: the whole picture, or with `foot` only its own cell (the
   * bottom 32 rows) painted with that 32x32 canvas; then the canvas-local `cut` rectangles cleared to alpha 0. Returns
   * the atlas key, which is also the canvas the occlusion outline reads.
   */
  wallCut(key: string, foot: string | null, cut: readonly Rect[]): string {
    if (!foot && !cut.length) return key;
    const k = `${key}|cut:${foot ?? ''}|${cut.map(r => `${r.x},${r.y},${r.w},${r.h}`).join(';')}`;
    this.ensure(k, () => {
      const src = this.canvas(key), { c, g } = canvas(src.width, src.height);
      if (foot) g.drawImage(this.canvas(foot), 0, src.height - 32); else g.drawImage(src, 0, 0);
      for (const r of cut) g.clearRect(r.x, r.y, r.w, r.h);
      return c;
    });
    return k;
  }

  private actorStyle(kind: ActorKind, variant?: string): string {
    return variant && this.art?.has(`coast-${variant}-body-e-f0-v1`) ? variant : kind;
  }
  actor(kind: ActorKind, dir: number, frame: number, variant?: string): Texture {
    const style = this.actorStyle(kind, variant), key = `actor:${style}:${dir}:${frame}`;
    return this.ensure(key, () => (this.art && solActorFrame(this.art, style, dir, frame)) || paintActorFrame(kind, dir, frame));
  }
  /** Whether the art has this body frame in the style actor() draws: the archetype's own when it has one, else the kind's. */
  hasBodyFrame(kind: ActorKind, frame: number, variant?: string): boolean {
    return !!this.art?.has(`coast-${this.actorStyle(kind, variant)}-body-e-f${frame}-v1`);
  }
  actorFlash(kind: ActorKind, dir: number, frame: number, variant?: string): Texture {
    const base = `actor:${this.actorStyle(kind, variant)}:${dir}:${frame}`; this.actor(kind, dir, frame, variant);
    return this.ensure(`${base}|white`, () => silhouette(this.canvas(base)));
  }
  actorEdge(kind: ActorKind, dir: number, frame: number, variant?: string): Texture {
    const base = `actor:${this.actorStyle(kind, variant)}:${dir}:${frame}`; this.actor(kind, dir, frame, variant);
    return this.ensure(`${base}|edge`, () => edge(this.canvas(base)));
  }
  actorRim(kind: ActorKind, dir: number, frame: number, variant?: string): Texture {
    const base = `actor:${this.actorStyle(kind, variant)}:${dir}:${frame}`; this.actor(kind, dir, frame, variant);
    return this.ensure(`${base}|rim`, () => rim(this.canvas(base)));
  }
  arm(kind: ActorKind, variant?: string): Texture {
    const style = this.actorStyle(kind, variant);
    return this.ensure(`arm:${style}`, () => paintArm(kind, style));
  }
  corpse(kind: ActorKind, facing: 1 | -1, variant?: string): Texture {
    const style = this.actorStyle(kind, variant);
    return this.ensure(`corpse:${style}:${facing}`, () => (this.art && (solCorpse(this.art, style, facing) || solCorpse(this.art, kind, facing))) || paintCorpse(kind, facing));
  }
  /** Where a corpse texture sits on the body's point: Sol corpses are anchored at their centre, painted ones at 14 of 24. */
  corpseAnchorY(kind: ActorKind, variant?: string): number {
    return this.art && (solCorpse(this.art, this.actorStyle(kind, variant), 1) || solCorpse(this.art, kind, 1)) ? .5 : 14 / 24;
  }

  /**
   * The player's gun drawn from Sol's gunsmith art (#28 M2-10) when its type has held images: its own standalone texture
   * and rim, with the muzzle tip on the barrel row (`tip`), so the flash and tracers follow attachments without reading
   * pixels. Null otherwise: the old art below.
   */
  private heldGun(gun: { id: string; sig: string }, kind: ActorKind): HeldArt | null {
    const key = `${gun.id}:${gun.sig}:${kind}`, hit = this.held.get(key);
    if (hit) { this.held.delete(key); this.held.set(key, hit); return hit; }
    const pic = gunsmithArt?.held(gun.id, gun.sig);
    if (!pic) return null;
    const tex = `${pic.key}:${kind}`, rimKey = `${tex}|rim`, rimCanvas = rim(pic.canvas);
    this.atlas.add(tex, pic.canvas, true); this.atlas.add(rimKey, rimCanvas, true);
    const [pivotX, pivotY] = pic.grip;
    const art: HeldArt = { canvas: pic.canvas, pivotX, pivotY, forward: pic.forward, muzzle: pic.forward + pic.tip[0] - pivotX,
      support: pic.hand ? pic.hand[0] - pivotX : 0, tip: { x: pic.tip[0], y: pic.bore }, texture: this.atlas.get(tex), rim: this.atlas.get(rimKey), keys: [tex, rimKey] };
    this.held.set(key, art);
    while (this.held.size > HELD_LIMIT) {
      const [old, gone] = this.held.entries().next().value!;
      this.held.delete(old);
      const uids = gone.keys.map(k => this.atlas.get(k).source.uid);
      for (const k of gone.keys) this.atlas.drop(k);
      this.release(uids);
    }
    return art;
  }
  /** How many held gunsmith pictures this view keeps (the resource checks). */
  get heldCount() { return this.held.size; }

  weapon(id: string, kind: ActorKind, variant?: string, gun?: { id: string; sig: string }): WeaponArt & { texture: Texture; rim: Texture; tip?: { x: number; y: number } } {
    // The factory carbine keeps its approved held art (same pixels, and its arm reach as playtested); with parts it is
    // drawn from the gunsmith art like the new guns.
    if (gun && kind === 'player' && !(gun.id === 'carbine' && gun.sig === '')) { const held = this.heldGun(gun, kind); if (held) return held; }
    // The ritualist's existing long-reach melee rule has a two-handed fishing tool; this is a view style, not a new item.
    if (id === 'club' && variant === 'tide-ritualist') id = 'polearm';
    const glove = kind === 'player' ? '#4a463c' : kind === 'salt' ? '#7f7a6b' : '#3e3a33';
    const key = `weapon:${id}:${kind === 'salt' || kind === 'elite' ? kind : glove}`;
    let art = this.weapons.get(key);
    if (!art) { art = (this.art && solWeapon(this.art, id, kind)) || paintWeapon(id, glove); this.weapons.set(key, art); this.canvases.set(key, art.canvas); this.atlas.add(key, art.canvas); }
    const rimKey = `${key}|rim`;
    if (!this.atlas.has(rimKey)) { const r = rim(art.canvas); this.canvases.set(rimKey, r); this.atlas.add(rimKey, r); }
    return { ...art, texture: this.atlas.get(key), rim: this.atlas.get(rimKey) };
  }

  muzzle(frame: number) { return this.ensure(`fx:muzzle:${frame}`, () => paintMuzzle(frame)); }
  crate(look: 'full' | 'empty' | 'open') { return this.ensure(`crate:${look}`, () => paintCrate(look)); }
  loot(item: string) { return this.ensure(`loot:${item}`, () => paintLoot(item)); }
  exitDecal() { return this.ensure('exit:decal', paintExitDecal); }
  destroy() { this.atlas.destroy(); this.canvases.clear(); this.weapons.clear(); }
  pixel() { return this.ensure('px', pixel); }
  blob(w: number, h: number) { return this.ensure(`blob:${w}x${h}`, () => blob(w, h)); }

  warm(kinds: ActorKind[]) {
    for (const k of kinds) for (let d = 0; d < 8; d++) for (let f = 0; f <= WALK_FRAMES; f++) this.actor(k, d, f);
  }
}
