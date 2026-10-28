import type { BuildingDef, DoorDef, MapDef, Point, Rect } from '../raid-runtime/contract';

const contains = (r: Rect, p: Point) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;

/** A layered map is one floor, including the landings and perimeter outside its named rooms. */
export function structureBounds(map: MapDef, building: BuildingDef): Rect {
  return map.key.mapId !== 'coast' && map.buildings.filter(b => b.regionIds.length).length === 1 ? map.bounds : building;
}

/** Display-only cutaway. This must never be used as actor, loot, decal or sound visibility permission. */
export function occupiedStructure(map: MapDef, player: Point): BuildingDef | null {
  return map.buildings.find(b => b.regionIds.length > 0 && contains(structureBounds(map, b), player)) ?? null;
}

export function structureContains(map: MapDef, building: BuildingDef | null, point: Point): boolean {
  return !!building && contains(structureBounds(map, building), point);
}

/** Static connections can be read throughout the occupied building's current floor. Other interiors stay covered. */
export function knownStructurePoint(map: MapDef, point: Point, revealed: Readonly<Record<string, boolean>>, occupied: BuildingDef | null): boolean {
  if (structureContains(map, occupied, point)) return true;
  return map.regions.filter(r => r.inside && contains(r, point)).every(r => revealed[r.id] === true);
}

export function knownDoor(map: MapDef, door: DoorDef, revealed: Readonly<Record<string, boolean>>, occupied: BuildingDef | null): boolean {
  return structureContains(map, occupied, { x: door.x * 32 + 16, y: door.y * 32 + 16 })
    || door.anchors.some(p => knownStructurePoint(map, p, revealed, occupied));
}

/**
 * Fail-closed visibility of a world point, the Runtime's rule (presentation.ts): regions may overlap, so a point is shown
 * only when every inside region containing it is revealed. Points in no inside region (streets, corridors) are shown.
 */
export function shownAt(map: MapDef, revealed: Readonly<Record<string, boolean>>, p: Point): boolean {
  return map.regions.every(r => !r.inside || !contains(r, p) || revealed[r.id] === true);
}
/** The region a point counts as: a containing unrevealed region wins, ties by stable id (presentation.ts). */
export function regionAtClosed(map: MapDef, revealed: Readonly<Record<string, boolean>>, p: Point): string | null {
  return map.regions.filter(r => r.inside && contains(r, p))
    .sort((a, b) => Number(!!revealed[a.id]) - Number(!!revealed[b.id]) || a.id.localeCompare(b.id, 'en'))[0]?.id ?? null;
}

/**
 * Whether the Runtime shows an actor now: the player always, anyone else when the room it counts as (fail closed) is
 * revealed or it stands in no room. Hit feedback checks the target this way as well as the hit point: a bullet's contact
 * lies on a circle around the target and can fall outside its room. A target the frame does not carry is left to the
 * hit point alone.
 */
export function actorShown(frame: { actors: readonly { uid: string; regionId: string | null }[]; revealed: Readonly<Record<string, boolean>> }, uid: string): boolean {
  if (uid === 'player') return true;
  const a = frame.actors.find(x => x.uid === uid);
  return !a || a.regionId === null || frame.revealed[a.regionId] === true;
}

export const isMall = (map: MapDef) => map.buildings.some(b => b.kind === 'mall');
