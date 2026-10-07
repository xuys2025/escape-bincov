/**
 * Front-end appearance table: terrain codes -> materials, buildings/regions -> look (storeys, roof art, lamps).
 * Display decisions only; nothing here enters the contract or a save.
 */
import type { BuildingDef, MapDef, Rect, RegionDef } from '../raid-runtime/contract';

export type GroundMaterial = 'asphalt' | 'yard' | 'tile' | 'wood' | 'concrete' | 'mud' | 'water' | 'void';

/** Tile rectangle that received sample-specific dressing (village street corner). Elsewhere uses the generic placeholder pipeline. */
export const SAMPLE_AREA: Rect = { x: 3 * 32, y: 1 * 32, w: 34 * 32, h: 26 * 32 };

const CONCRETE_KINDS = new Set(['workshop', 'warehouse', 'utility', 'pump', 'harbor', 'laboratory']);
const isResident = (b: BuildingDef) => b.id.endsWith('/building/resident');

/** Roof art exists only for coast buildings that own reveal regions; buildings without regions stay open as today. */
export const hasRoof = (m: MapDef, b: BuildingDef) => m.key.mapId === 'coast' && b.regionIds.length > 0;
export const storeys = (m: MapDef, b: BuildingDef) => m.key.mapId === 'coast' && isResident(b) ? 2 : 1;
export const isRuined = (m: MapDef, b: BuildingDef) => m.key.mapId === 'coast' && b.regionIds.length === 0;

export function materials(m: MapDef): GroundMaterial[][] {
  const owner = (x: number, y: number) => m.buildings.find(b => x * 32 >= b.x && x * 32 < b.x + b.w && y * 32 >= b.y && y * 32 < b.y + b.h);
  const region = (x: number, y: number): RegionDef | undefined => m.regions.find(r => x * 32 >= r.x && x * 32 < r.x + r.w && y * 32 >= r.y && y * 32 < r.y + r.h);
  const upstairs = m.key.mapId.endsWith('-f2'), basement = m.key.mapId.endsWith('-b1');
  return m.terrain.map((row, y) => row.map((t, x): GroundMaterial => {
    switch (t) {
      case 1: return 'asphalt';
      // Classic deep water does not block bullets: draw it as water, never as wall.
      case 2: return x === 0 || y === 0 || y === m.rows - 1 ? 'void' : 'water';
      case 4: return 'mud';
      case 6: return 'wood';
      case 3: case 5: {
        if (basement) return 'concrete';
        if (upstairs) return region(x, y)?.id.endsWith('/hall') ? 'tile' : 'wood';
        const b = owner(x, y);
        return b && CONCRETE_KINDS.has(b.kind) ? 'concrete' : 'tile';
      }
      default: return 'yard';
    }
  }));
}

/** One lamp per reveal region (hidden until the region is revealed). */
export function regionLamps(m: MapDef) {
  return m.regions.filter(r => r.inside).map(r => ({ x: r.x + r.w / 2, y: r.y + Math.min(r.h / 2, 72), region: r.id, warm: !r.id.endsWith('/hall') }));
}
