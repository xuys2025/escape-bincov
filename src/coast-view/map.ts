/**
 * Map panel of the village sample. Same information as the original drawMap: terrain colours, district and room
 * names, stairs, doors, the raid's visible exits and the player marker on the current floor. Enemies, loot and
 * unrevealed contents are never drawn.
 */
import { mapPresentation } from '../building-world';
import { resolveExpansionWorld } from '../expansion-worlds';
import type { SessionState } from '../session';
import type { PublishedView } from '../raid-runtime/contract';
import { WORLD } from '../world';

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function floors(session: SessionState): { id: string; label: string }[] {
  const raid = session.expansion?.raid, world = raid ? resolveExpansionWorld(raid.worldVersion) : null;
  if (!world) return [{ id: 'coast', label: '沿海封锁区' }];
  return Object.values(world.maps).map(m => ({ id: m.id, label: m.id === 'coast' ? '地面' : m.floor }));
}

export function mapPanelHtml(session: SessionState, batch: PublishedView, view: string, selectedExit: string, touch: boolean) {
  const exits = batch.map.key.mapId === 'coast' ? batch.map.exits : [];
  const tabs = floors(session).map(f => `<button type="button" data-do="map-floor" data-id="${f.id}"${f.id === view ? ' aria-current="page"' : ''}>${esc(f.label)}</button>`).join('');
  const options = exits.map(e => `<option value="${esc(e.name)}"${e.name === selectedExit ? ' selected' : ''}>${esc(e.name)}</option>`).join('');
  return `<header class="cs-inv-head"><div><h2>${esc(batch.map.name)} · ${esc(batch.map.floor)}</h2><span class="cs-sub">${touch ? '不暂停行动' : '不暂停行动 · M 关闭'}</span></div><button type="button" data-do="close">关闭</button></header>
    <div class="cs-map-tabs">${tabs}</div>
    <canvas class="cs-map" width="960" height="694" data-map></canvas>
    <label class="cs-exit">撤离指引 <select data-exit aria-label="选择撤离点"${options ? '' : ' disabled'}><option value="">${options ? '暂不选择' : '回到地面查看撤离点'}</option>${options}</select></label>`;
}

interface Box { x0: number; y0: number; x1: number; y1: number }
/** Where each label went (null: dropped for lack of space) and the markers they avoid, for the overlap checks. */
export interface MapLabel { name: string; kind: 'exit' | 'zone' | 'room'; box: Box | null }
export interface MapLayout { labels: MapLabel[]; markers: Box[] }

export function drawMap(canvas: HTMLCanvasElement, session: SessionState, batch: PublishedView, view: string, touch: boolean, selectedExit = ''): MapLayout {
  const raid = session.expansion?.raid, world = raid ? resolveExpansionWorld(raid.worldVersion) : null;
  const definition = world?.maps[view];
  const map = definition ? mapPresentation(definition) : WORLD;
  const cols = map.tiles[0].length, rows = map.tiles.length;
  // Keep the map's aspect ratio inside the canvas.
  const scale = Math.min(canvas.width / (cols * 32), canvas.height / (rows * 32)), ox = (canvas.width - cols * 32 * scale) / 2, oy = (canvas.height - rows * 32 * scale) / 2;
  const g = canvas.getContext('2d')!, X = (x: number) => ox + x * scale, Y = (y: number) => oy + y * scale;
  // Canvas pixels per CSS pixel: labels and markers keep their on-screen size at any panel size and DPR.
  const k = canvas.width / Math.max(1, canvas.clientWidth || canvas.width);
  g.fillStyle = '#0e1a1b'; g.fillRect(0, 0, canvas.width, canvas.height);
  // On the floor being played, tide cells take the flooded colour exactly where the Runtime reports water (R6-L4).
  const flooded = view === batch.stamp.world.mapId ? new Set(batch.frame.flooded) : null;
  map.tiles.forEach((row, y) => row.forEach((t, x) => {
    const high = flooded ? flooded.has(y * cols + x) : batch.frame.highTide;
    g.fillStyle = ['#384b3e', '#849178', '#12363b', '#141e1b', high ? '#724840' : '#44665a', '#69735d', '#8e805b'][t] || '#222';
    g.fillRect(X(x * 32), Y(y * 32), 32 * scale + 1, 32 * scale + 1);
  }));
  const size = Math.round((touch ? 12 : 14) * k);
  g.font = `${size}px ${touch ? '"Microsoft YaHei", sans-serif' : '"Bincov Text", "Microsoft YaHei", sans-serif'}`; g.textAlign = 'center';
  definition?.entries.forEach(e => { g.fillStyle = '#d8bc76'; g.fillRect(X(e.at.x) - 4 * k, Y(e.at.y) - 4 * k, 8 * k, 8 * k); });
  definition?.doors.forEach(d => { g.fillStyle = '#b68552'; g.fillRect(X(d.x * 32), Y(d.y * 32), 32 * scale, 32 * scale); });
  const current = view === batch.stamp.world.mapId, exits = current && view === 'coast' ? batch.map.exits : [];
  const p = current ? batch.frame.player : null;
  for (const e of exits) { g.strokeStyle = '#d7ed90'; g.lineWidth = 2 * k; g.strokeRect(X(e.at.x) - 6 * k, Y(e.at.y) - 6 * k, 12 * k, 12 * k); }
  if (p) { g.fillStyle = '#fff'; g.beginPath(); g.arc(X(p.x), Y(p.y), 4 * k, 0, Math.PI * 2); g.fill(); }
  // Labels go last and never cover each other, the exit and stair squares or the player dot. Each tries a few spots around its
  // anchor; when none is free an exit is still drawn above its marker and a district or room name is dropped.
  // Priority: the chosen exit, other exits, districts, rooms.
  const square = (x: number, y: number, r: number): Box => ({ x0: x - r, y0: y - r, x1: x + r, y1: y + r });
  const taken = [...exits.map(e => square(X(e.at.x), Y(e.at.y), 7 * k)), ...(definition?.entries ?? []).map(e => square(X(e.at.x), Y(e.at.y), 4 * k)),
    ...(p ? [square(X(p.x), Y(p.y), 5 * k)] : [])];
  const markers = [...taken], layout: MapLabel[] = [];
  const free = (b: Box) => !taken.some(o => b.x0 < o.x1 && o.x0 < b.x1 && b.y0 < o.y1 && o.y0 < b.y1);
  // `clear` is the half-size of a marker at (x, y) that the label must sit around rather than on.
  const label = (name: string, x: number, y: number, color: string, kind: MapLabel['kind'], clear = 0) => {
    const w = g.measureText(name).width + 6 * k, h = size + 4 * k, gap = clear + 3 * k;
    const at = (cx: number, base: number): Box => {
      cx = Math.max(w / 2, Math.min(canvas.width - w / 2, cx)); base = Math.max(size + 3 * k, Math.min(canvas.height - 4 * k, base));
      return { x0: cx - w / 2, y0: base - size - 2 * k, x1: cx + w / 2, y1: base + 2 * k };
    };
    const mid = y + size / 2 - k;
    const spots = clear
      ? [at(x, y - gap - 2 * k), at(x, y + gap + size + 2 * k), at(x + gap + w / 2, mid), at(x - gap - w / 2, mid), at(x, y - gap - 2 * k - h), at(x, y + gap + size + 2 * k + h)]
      : [at(x, mid), at(x, mid - h), at(x, mid + h), at(x + w / 2 + 4 * k, mid), at(x - w / 2 - 4 * k, mid), at(x, mid - 2 * h), at(x, mid + 2 * h)];
    const b = spots.find(free) ?? (kind === 'exit' ? spots[0] : null);
    layout.push({ name, kind, box: b });
    if (!b) return;
    taken.push(b);
    g.fillStyle = color; g.strokeStyle = '#172e35'; g.lineWidth = 3 * k;
    g.strokeText(name, (b.x0 + b.x1) / 2, b.y1 - 2 * k); g.fillText(name, (b.x0 + b.x1) / 2, b.y1 - 2 * k);
  };
  [...exits].sort((a, b) => Number(b.name === selectedExit) - Number(a.name === selectedExit))
    .forEach(e => label(e.name, X(e.at.x), Y(e.at.y), '#d7ed90', 'exit', 7 * k));
  map.zones.forEach(z => label(z.name, X(z.x + z.w / 2), Y(z.y + z.h / 2), '#f0e4b8', 'zone'));
  definition?.regions?.forEach(r => label(r.name, X(r.x + r.w / 2), Y(r.y + r.h / 2), '#e0dabb', 'room'));
  return { labels: layout, markers };
}
