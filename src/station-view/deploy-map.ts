import type { RunWorld } from '../hideout-runtime/contract';
import { esc } from '../html';

/** Display identities on the county overview. None of them is stored in a save or creates a world. */
export type RegionId = 'old-town' | 'mall' | 'hospital' | 'old-hospital' | 'factory' | 'laboratory' | 'highway' | 'market' | 'observatory' | 'lighthouse' | 'harbor' | 'freighter';
/**
 * Image URLs the renderer imports (src/station-view/county-art.ts) and hands in, so these builders stay Node-safe.
 * The terrain is set once as the --county-terrain property of the UI root; the HTML never repeats its data URL.
 */
export interface CountyArt { terrain: string; regions: Readonly<Record<RegionId, string>> }
/** The side of its landmark a label sits on: the label never covers the landmark it names. */
type Side = 'l' | 'r' | 't' | 'b';
interface Region {
  id: RegionId | 'coast'; name: string; area: string;
  /** Landmark on the county art in percent of its width and height. Marker, light and route share this space. */
  x: number; y: number; side: Side;
  /** Label side on a phone held upright, where the 3:2 map is only about 390 px wide; defaults to `side`. */
  narrow?: Side;
  /** Vertical focus of the briefing art (percent) when a short frame crops it. */
  focus: number;
  description: string; features: string; world?: RunWorld;
}

// A geographic overview, not connected playable terrain. Only existing worlds get a deployment target.
// The old-town slot offers today's coastal street, not a claim that the planned old town is complete.
const REGIONS: readonly Region[] = [
  { id: 'old-town', name: '老城街区', area: '内陆 · 居住区', x: 32.5, y: 37, side: 'r', focus: 60, world: 'buildings', description: '沿着街口进入居民楼，在楼道与院落间寻找物资。留意转角，把回家的路记清。', features: '沿海街区 / 居民楼 / 地下空间' },
  { id: 'mall', name: '滨湾商场', area: '内陆 · 商业区', x: 44.5, y: 52.5, side: 'r', focus: 65, world: 'mall', description: '卷帘门后的卖场早已失去秩序。穿过货架与中庭，在两层商场和露台之间寻找撤离路线。', features: '两层卖场 / 室外露台 / 室内搜刮' },
  { id: 'hospital', name: '县医院', area: '内陆 · 医疗区', x: 18.5, y: 21.5, side: 'l', focus: 35, description: '仍在有限运转的门诊、病房与隔离区。医护守着药库，也守着最后的救治顺序。', features: '门诊 / 药库 / 隔离区' },
  { id: 'old-hospital', name: '县医院旧址', area: '内陆 · 废弃院区', x: 14, y: 51, side: 'b', focus: 45, description: '搬迁后的病房与档案室被拾荒者占据。封闭地下层里，旧病例仍等待有人读懂。', features: '废弃病房 / 档案室 / 封闭地下层' },
  { id: 'factory', name: '工厂区', area: '内陆 · 工业区', x: 46.5, y: 14, side: 'b', focus: 5, description: '停工的厂房、铁路货场与维修车间连成一片。设备之间的窄路通向开阔而危险的装卸场。', features: '机械厂 / 维修车间 / 铁路货场' },
  { id: 'laboratory', name: '隐秘实验室', area: '内陆 · 地下设施', x: 66.5, y: 13, side: 'b', focus: 40, description: '停产厂房之下，样本库与封闭试验区仍藏着灾难被放大的证据。', features: '样本库 / 设备间 / 封闭试验区' },
  { id: 'highway', name: '西线国道', area: '内陆 · 县境通道', x: 29.5, y: 8, side: 'l', focus: 50, description: '废弃车队停在加油站与检查口之间。县内高地上的公路，曾是通往外面的方向。', features: '加油站 / 服务区 / 检查口' },
  { id: 'market', name: '水产市场', area: '沿海 · 冷链交易区', x: 26, y: 70.5, side: 't', narrow: 'r', focus: 50, description: '交易厅已经安静，冷库和维修仓里仍可能留下补给。这里曾是水产站最熟悉的一条采购线。', features: '交易厅 / 冷库 / 维修仓' },
  { id: 'observatory', name: '观测站与泵房', area: '沿海 · 海堤设施', x: 61.5, y: 69, side: 'r', narrow: 'b', focus: 5, description: '观测仪记录潮位，泵房守着海堤。沿维护道路寻找样本室与配电所，拼出海的规律。', features: '观测主楼 / 样本室 / 海堤泵房' },
  { id: 'lighthouse', name: '灯塔岬角', area: '沿海 · 岬角高地', x: 85.5, y: 80.5, side: 'b', focus: 0, description: '灯塔立在海边高地，废炮台与宿舍沿坡道分布。有人把这里当作庇护，也有人把它当作信仰。', features: '灯塔 / 山间坡道 / 地下设备间' },
  { id: 'harbor', name: '旧渔港', area: '海运 · 港口仓储', x: 66.5, y: 46, side: 'r', focus: 60, description: '修船棚、燃油库和集装箱围着老码头。船册与运输记录，或许能解释那些不该抵港的货物。', features: '船务所 / 燃油库 / 集装箱码头' },
  { id: 'freighter', name: '远汐号', area: '海运 · 搁浅货轮', x: 88, y: 57.5, side: 'l', narrow: 'b', focus: 30, description: '货轮歪着船身留在港外。狭窄舱道连着甲板、机舱和污染货舱，货运清单记录着最后一次航行。', features: '甲板 / 船员舱 / 货舱' },
];
const LEGACY: Region = { id: 'coast', name: '沿海封锁区', area: '历史行动测试', x: 50, y: 50, side: 'r', focus: 50, world: 'coast', description: '仅在显式测试入口保留的经典行动。', features: '经典规则 / 每局 10 分钟' };
const BASE = { x: 35, y: 87.5 };
// Roads from the station to each open region, in the art's percent space; painted as one smoothed curve.
const SOUTH_ROAD = [[34, 86], [31, 84.3], [28.5, 81.8], [25.5, 79.3], [22, 77], [19.3, 75.6], [18.3, 72], [18.6, 67.5], [20.3, 63.5], [23, 59.5], [25, 55.5]] as const;
const ROUTES: Partial<Record<RegionId, readonly (readonly [number, number])[]>> = {
  'old-town': [...SOUTH_ROAD, [26.2, 50], [27, 44], [27.8, 39.5], [29.6, 37.2], [32.5, 37]],
  mall: [...SOUTH_ROAD, [28, 55], [31, 53.3], [34, 51.2], [38, 51], [41.5, 52], [44.5, 52.5]],
};
// The art is 1536 x 1024; the overlay draws in its pixel space so strokes and grid line up at any scale.
const ART_W = 1536, ART_H = 1024;

/** Preview state never grants access: the host's existing world allowlist remains authoritative. */
export function deploymentRegion(worlds: readonly RunWorld[], world: RunWorld, preview: string | null): Region {
  const regions = worlds.includes('coast') ? [...REGIONS, LEGACY] : REGIONS;
  return regions.find(r => r.id === preview) ?? regions.find(r => r.world === world) ?? REGIONS[0];
}

export function deploymentWorld(region: Region, worlds: readonly RunWorld[]): RunWorld | null {
  return region.world && worlds.includes(region.world) ? region.world : null;
}

const displayName = (r: Region) => r.world === 'buildings' ? '沿海街区' : r.name;
const num = (n: number) => String(Math.round(n * 10) / 10);
const two = (n: number) => String(n).padStart(2, '0');

/** Catmull-Rom through the waypoints as cubic Bezier segments, in the art's pixel space. */
function curve(points: readonly (readonly [number, number])[]): string {
  const p = points.map(([x, y]) => [x * ART_W / 100, y * ART_H / 100] as const);
  let d = `M${num(p[0][0])} ${num(p[0][1])}`;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i - 1] ?? p[i], b = p[i], c = p[i + 1], e = p[i + 2] ?? c;
    d += `C${num(b[0] + (c[0] - a[0]) / 6)} ${num(b[1] + (c[1] - a[1]) / 6)} ${num(c[0] - (e[0] - b[0]) / 6)} ${num(c[1] - (e[1] - b[1]) / 6)} ${num(c[0])} ${num(c[1])}`;
  }
  return d;
}

function nodeHtml(r: Region, worlds: readonly RunWorld[], on: boolean, narrow: boolean): string {
  const world = deploymentWorld(r, worlds), name = world ? displayName(r) : r.name;
  const attrs = `class="county-node ${world ? 'world available' : 'unbuilt'}${on ? ' on' : ''}" data-side="${narrow ? r.narrow ?? r.side : r.side}" style="--x:${r.x};--y:${r.y}"`;
  const body = `<i class="node-pin" aria-hidden="true"></i><span class="node-label"><b>${esc(name)}</b><small>${world ? '可出击' : '暂未开发'}</small></span>`;
  return world ? `<label ${attrs}><input type="radio" name="world" value="${world}" aria-label="${esc(name)} · 可出击" ${on ? 'checked' : ''}>${body}</label>`
    : `<button type="button" ${attrs} data-region="${r.id}" aria-pressed="${on}" aria-label="${esc(r.name)} · 暂未开发，查看规划">${body}</button>`;
}

/**
 * The map is one fixed 3:2 stage (art, overlay, light and markers in the same percent space); CSS fits it into the
 * chart. Keyed parts (data-key) are replaced when the selection changes, so their entry animation runs once per pick.
 */
export function countyMapHtml(region: Region, worlds: readonly RunWorld[], narrow: boolean): string {
  const active = deploymentWorld(region, worlds), onMap = region.id !== 'coast';
  const open = REGIONS.filter(r => deploymentWorld(r, worlds)).length;
  const points = active && onMap ? ROUTES[region.id as RegionId] : undefined, route = points && curve(points);
  const nodes = REGIONS.map(r => nodeHtml(r, worlds, r.id === region.id, narrow)).join('');
  return `<section class="county-survey" aria-label="滨科夫县区域选择">
    ${worlds.includes('coast') ? `<label class="world county-legacy ${region.id === 'coast' ? 'on' : ''}"><input type="radio" name="world" value="coast" ${region.id === 'coast' ? 'checked' : ''}><b>沿海封锁区</b><small>历史行动测试</small></label>` : ''}
    <header class="county-heading"><small>作战终端 / 区域总览</small><h3>滨科夫县<span>BINCOV COUNTY</span></h3><p class="county-count"><strong>${two(open)}</strong><span>/ ${REGIONS.length} 区域可出击</span></p>
      <svg class="county-compass" viewBox="-20 -28 40 56" aria-hidden="true"><path d="M0-22L7 6 0 1-7 6Z"/><path d="M0 8V22M-12 0H-6M6 0H12"/></svg></header>
    <div class="county-chart"><i class="county-ambient" aria-hidden="true"></i>
      <div class="county-stage ${onMap ? active ? 'live' : 'unbuilt' : 'off'}" style="--map-x:${region.x};--map-y:${region.y}">
        <i class="county-art" aria-hidden="true"></i><i class="county-lit" aria-hidden="true"></i>
        <svg class="county-overlay" viewBox="0 0 ${ART_W} ${ART_H}" aria-hidden="true"><defs><pattern id="county-grid" width="128" height="128" patternUnits="userSpaceOnUse"><path d="M128 0H0V128"/></pattern></defs><rect class="county-grid" width="${ART_W}" height="${ART_H}"/>
          ${route ? `<g class="county-route" data-key="route-${region.id}"><path class="route-bed" pathLength="1" d="${route}"/><path class="route-line" d="${route}"/></g>` : ''}</svg>
        ${onMap ? `<div class="county-lock" data-key="lock-${region.id}" aria-hidden="true"><i></i></div>` : ''}
        <div class="county-nodes" role="group" aria-label="选择行动区域或查看未开发区域">${nodes}
          <div class="county-base" data-side="l" style="--x:${BASE.x};--y:${BASE.y}"><i class="node-pin" aria-hidden="true"></i><span class="node-label"><b>滨科夫水产站</b><small>当前据点</small></span></div></div>
      </div>
    </div>
    <footer class="county-legend"><span><i class="live"></i>可出击 ${open}</span><span><i></i>暂未开发 ${REGIONS.length - open}</span><small>区域方位示意 · 虚线为出发路线</small></footer>
  </section>`;
}

export function regionBriefHtml(region: Region, worlds: readonly RunWorld[], art: CountyArt['regions']): string {
  const world = deploymentWorld(region, worlds), name = world ? displayName(region) : region.name;
  const index = REGIONS.indexOf(region), image = region.id === 'coast' ? '' : art[region.id];
  const features = region.features.split(' / ').map(f => `<li>${esc(f)}</li>`).join('');
  return `<div class="region-brief ${world ? 'live' : 'unbuilt'}"><button type="button" class="county-back" data-act="county-map">↑ 返回地图</button>
    <p class="region-eyebrow"><span>区域情报${index >= 0 ? ` · ${two(index + 1)} / ${REGIONS.length}` : ''}</span><strong>${world ? '● 可出击' : '◇ 暂未开发'}</strong></p>
    <figure class="region-art ${image ? '' : 'bare'}" data-key="art-${region.id}" style="--focus:${region.focus}%">${image ? `<img src="${esc(image)}" alt="" decoding="async" draggable="false"><span class="region-tag">情报示意图</span>` : ''}
      <figcaption><span class="region-area">${esc(region.area)}${world === 'buildings' ? ' / 老城街区现有入口' : ''}</span><h3>${esc(name)}</h3></figcaption></figure>
    <div class="region-copy" data-key="copy-${region.id}"><p class="region-description">${esc(region.description)}</p><ul class="region-features">${features}</ul>
    ${world ? `<div class="region-stats"><span>行动时限<b>10 <small>分钟</small></b></span><span>撤离后返回<b>水产站</b></span></div>${world === 'buildings' ? '<p class="region-development">当前可玩沿海街区；老城完整区域仍待扩展。</p>' : ''}` : '<p class="region-development">以上为区域规划，地图与玩法暂未开发，当前无法出击。</p>'}</div></div>`;
}
