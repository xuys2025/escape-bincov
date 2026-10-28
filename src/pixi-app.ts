/**
 * The page's one Pixi Application, shared by the raid view and the station yard: they take turns on it and park it
 * between mounts (OPUS-MEM-01). Every new renderer compiles its graphics and back-buffer programs again, and Pixi 8
 * names each compile with a new counter suffix, so each source string is new to its global id cache and kept for the
 * page's life: about 5.4 KB per mount. Reusing the renderer compiles them once.
 * Parking leaves no scene: the view has destroyed its containers, render targets and textures; the stage is emptied,
 * the ticker stopped, the canvas detached and Pixi's global pools released. A parked context that was lost is destroyed
 * and replaced. This module knows no scene, page or game state.
 */
import { Application, GlobalResourceRegistry } from 'pixi.js';
// Registers the kept-program graphics adaptor before takeApp creates the page's renderer (ASTRA-R3-PIXI-01).
import './view-lifecycle/renderer-lifetime';
import { lifecycle } from './view-lifecycle/scope';

let parked: Application | null = null, current: Application | null = null;
export async function takeApp(): Promise<Application> {
  const app = parked; parked = null; lifecycle.parked = 0;
  if (app && !(app.renderer as { gl?: WebGL2RenderingContext }).gl?.isContextLost()) {
    app.renderer.resize(innerWidth, innerHeight); app.ticker.start();
    return current = app;
  }
  if (app) dropApp(app);
  const fresh = new Application();
  try {
    await fresh.init({ background: 0x121110, antialias: false, resolution: 1, autoDensity: false, preference: 'webgl', width: innerWidth, height: innerHeight, powerPreference: 'high-performance' });
  } catch (error) {
    // Before init resolves Application.destroy assumes a renderer that may not exist yet.
    if (fresh.renderer) dropApp(fresh);
    else fresh.stage.destroy({ children: true, context: true });
    throw error;
  }
  detachPixiEvents(fresh);
  return current = fresh;
}
/**
 * The views never use Pixi's federated events: they read the DOM themselves. Left attached, Pixi's event system
 * listens on the canvas, document and window, and its pooled events keep the last native PointerEvent, whose event path
 * holds the HUD of an unmounted host while the renderer is parked (R7-F20-FE-02). It is detached once, right after
 * init; Application.destroy detaches again harmlessly. The two styles it wrote on the canvas (touch-action none,
 * cursor inherit) are kept by coast.css.
 */
function detachPixiEvents(app: Application) {
  (app.renderer as unknown as { events?: { setTargetElement(element: HTMLElement | null): void } }).events?.setTargetElement(null);
}
/**
 * Pixi 8 keeps every GPU resource and renderable it manages in GCSystem hashes keyed by uid, and a released entry
 * becomes a null placeholder (GCManagedHash.remove). Pixi rebuilds a hash without them only after 10,000 placeholders
 * and only while rendering, so a parked renderer keeps one per Graphics, texture, buffer and geometry the last view
 * released: about 24 Graphics slots a run (R7-F20-FE-01). Parking does the same rebuild Pixi does (copy the live
 * entries into a fresh table), never touching a live entry. Returns the placeholders dropped; if Pixi's internals
 * change shape this finds no table and returns 0, which the sample check W11 would report as growth.
 */
function compactManagedHashes(app: Application): number {
  const gc = (app.renderer as unknown as { gc?: { _running?: boolean; _managedResourceHashes?: { context: Record<string, unknown>; hash: string }[] } }).gc;
  const list = gc?._managedResourceHashes;
  if (!Array.isArray(list) || gc!._running) return 0;
  let dropped = 0;
  for (const { context, hash } of list) {
    const table = context?.[hash] as Record<string, unknown> | undefined;
    if (!table || typeof table !== 'object' || Array.isArray(table)) continue;
    let nulls = 0;
    for (const key in table) if (table[key] === null) nulls++;
    if (!nulls) continue;
    const live: Record<string, unknown> = Object.create(null);
    for (const key in table) if (table[key] !== null) live[key] = table[key];
    context[hash] = live; dropped += nulls;
  }
  return dropped;
}
/** Null placeholders and live entries across the renderer's GC-managed hashes (read by the sample checks). */
export function managedSlots(): { live: number; empty: number } {
  const list = (current?.renderer as unknown as { gc?: { _managedResourceHashes?: { context: Record<string, unknown>; hash: string }[] } } | undefined)?.gc?._managedResourceHashes;
  let live = 0, empty = 0;
  for (const { context, hash } of Array.isArray(list) ? list : []) {
    const table = context?.[hash] as Record<string, unknown> | undefined;
    if (table && typeof table === 'object' && !Array.isArray(table)) for (const key in table) if (table[key] === null) empty++; else live++;
  }
  return { live, empty };
}
export function parkApp(app: Application) {
  for (const c of app.stage.removeChildren()) c.destroy({ children: true, context: true });
  app.ticker.stop(); app.canvas.remove();
  // Pixi's global pools (BigPool batch objects, pooled render textures, canvases) are what releaseGlobalResources
  // cleared on destroy; they only hold returned objects, so emptying them with the renderer alive is safe.
  GlobalResourceRegistry.release();
  compactManagedHashes(app);
  if (parked && parked !== app) dropApp(parked);
  parked = app; lifecycle.parked = 1;
}
function dropApp(app: Application) {
  app.destroy({ removeView: true, releaseGlobalResources: true }, { children: true, texture: true, textureSource: true });
  if (current === app) current = null;
}
/**
 * GPU textures the page's renderer still manages, mounted or parked (read by the sample checks). Pixi nulls a released
 * slot and compacts the hash later, so only live entries are counted.
 */
export const gpuTextures = () => (current?.renderer.texture as { managedTextures?: unknown[] } | undefined)?.managedTextures?.filter(Boolean).length ?? 0;
