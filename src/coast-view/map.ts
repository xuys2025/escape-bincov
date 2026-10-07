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

export function drawMap(canvas: HTMLCanvasElement, session: SessionState, batch: PublishedView, view: string, touch: boolean) {
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
  map.tiles.forEach((row, y) => row.forEach((t, x) => {
    g.fillStyle = ['#384b3e', '#849178', '#12363b', '#141e1b', batch.frame.highTide ? '#724840' : '#44665a', '#69735d', '#8e805b'][t] || '#222';
    g.fillRect(X(x * 32), Y(y * 32), 32 * scale + 1, 32 * scale + 1);
  }));
  const size = Math.round((touch ? 12 : 14) * k);
  g.font = `${size}px ${touch ? '"Microsoft YaHei", sans-serif' : '"Bincov Text", "Microsoft YaHei", sans-serif'}`; g.textAlign = 'center';
  const label = (name: string, x: number, y: number) => {
    const half = g.measureText(name).width / 2 + 3;
    x = Math.max(half, Math.min(canvas.width - half, x)); y = Math.max(size + 3, Math.min(canvas.height - 4, y));
    g.strokeStyle = '#172e35'; g.lineWidth = 3 * k; g.strokeText(name, x, y); g.fillText(name, x, y);
  };
  map.zones.forEach(z => { g.fillStyle = '#f0e4b8'; label(z.name, X(z.x + z.w / 2), Y(z.y + z.h / 2)); });
  definition?.regions?.forEach(r => { g.fillStyle = '#e0dabb'; label(r.name, X(r.x + r.w / 2), Y(r.y + r.h / 2)); });
  definition?.entries.forEach(e => { g.fillStyle = '#d8bc76'; g.fillRect(X(e.at.x) - 4 * k, Y(e.at.y) - 4 * k, 8 * k, 8 * k); });
  definition?.doors.forEach(d => { g.fillStyle = '#b68552'; g.fillRect(X(d.x * 32), Y(d.y * 32), 32 * scale, 32 * scale); });
  const current = view === batch.stamp.world.mapId;
  if (current && view === 'coast') for (const e of batch.map.exits) {
    g.strokeStyle = '#d7ed90'; g.lineWidth = 2 * k; g.strokeRect(X(e.at.x) - 6 * k, Y(e.at.y) - 6 * k, 12 * k, 12 * k);
    g.fillStyle = '#d7ed90'; label(e.name, X(e.at.x), Y(e.at.y) - 12 * k);
  }
  if (current) { const p = batch.frame.player; g.fillStyle = '#fff'; g.beginPath(); g.arc(X(p.x), Y(p.y), 4 * k, 0, Math.PI * 2); g.fill(); }
}
