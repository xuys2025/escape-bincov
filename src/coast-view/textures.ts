import type { Texture } from 'pixi.js';
import type { ActorKind } from '../raid-runtime/contract';
import { Atlas } from './atlas';
import { WALK_FRAMES, paintActorFrame, paintArm, paintCorpse, paintMuzzle, paintWeapon, type WeaponArt } from './art/actors';
import { dithered, edge, rim, silhouette } from './art/paint';
import { blob, paintCrate, paintExitDecal, paintLoot, pixel } from './art/props';
import { solPlayerFrame, solWeapon, type SolArt } from './art/sol';

export const FADE_LEVELS = [1, .7, .45, .25, 0];

export class Textures {
  readonly atlas = new Atlas();
  private canvases = new Map<string, HTMLCanvasElement>();
  private weapons = new Map<string, WeaponArt>();
  /** Sol samples, or null for the procedural placeholders (?art=placeholder). */
  constructor(readonly art: SolArt | null = null) {}

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

  actor(kind: ActorKind, dir: number, frame: number): Texture {
    const key = `actor:${kind}:${dir}:${frame}`;
    return this.ensure(key, () => (kind === 'player' && this.art && solPlayerFrame(this.art, dir, frame))
      || paintActorFrame(kind, dir, frame));
  }
  actorFlash(kind: ActorKind, dir: number, frame: number): Texture {
    const base = `actor:${kind}:${dir}:${frame}`; this.actor(kind, dir, frame);
    return this.ensure(`${base}|white`, () => silhouette(this.canvas(base)));
  }
  actorEdge(kind: ActorKind, dir: number, frame: number): Texture {
    const base = `actor:${kind}:${dir}:${frame}`; this.actor(kind, dir, frame);
    return this.ensure(`${base}|edge`, () => edge(this.canvas(base)));
  }
  actorRim(kind: ActorKind, dir: number, frame: number): Texture {
    const base = `actor:${kind}:${dir}:${frame}`; this.actor(kind, dir, frame);
    return this.ensure(`${base}|rim`, () => rim(this.canvas(base)));
  }
  arm(kind: ActorKind): Texture { return this.ensure(`arm:${kind}`, () => paintArm(kind)); }
  corpse(kind: ActorKind, facing: 1 | -1): Texture { return this.ensure(`corpse:${kind}:${facing}`, () => paintCorpse(kind, facing)); }

  weapon(id: string, kind: ActorKind): WeaponArt & { texture: Texture; rim: Texture } {
    const glove = kind === 'player' ? '#4a463c' : kind === 'salt' ? '#7f7a6b' : '#3e3a33';
    const key = `weapon:${id}:${glove}`;
    let art = this.weapons.get(key);
    if (!art) { art = (this.art && solWeapon(this.art, id)) || paintWeapon(id, glove); this.weapons.set(key, art); this.canvases.set(key, art.canvas); this.atlas.add(key, art.canvas); }
    const rimKey = `${key}|rim`;
    if (!this.atlas.has(rimKey)) { const r = rim(art.canvas); this.canvases.set(rimKey, r); this.atlas.add(rimKey, r); }
    return { ...art, texture: this.atlas.get(key), rim: this.atlas.get(rimKey) };
  }

  muzzle(frame: number) { return this.ensure(`fx:muzzle:${frame}`, () => paintMuzzle(frame)); }
  crate(empty: boolean) { return this.ensure(`crate:${empty ? 'empty' : 'full'}`, () => paintCrate(empty)); }
  loot(item: string) { return this.ensure(`loot:${item}`, () => paintLoot(item)); }
  exitDecal() { return this.ensure('exit:decal', paintExitDecal); }
  destroy() { this.atlas.destroy(); this.canvases.clear(); this.weapons.clear(); }
  pixel() { return this.ensure('px', pixel); }
  blob(w: number, h: number) { return this.ensure(`blob:${w}x${h}`, () => blob(w, h)); }

  warm(kinds: ActorKind[]) {
    for (const k of kinds) for (let d = 0; d < 8; d++) for (let f = 0; f <= WALK_FRAMES; f++) this.actor(k, d, f);
  }
}
