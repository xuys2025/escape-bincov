// County map: briefing pins and a tide simulation.
// The sea is read from the terrain picture; the exact Euclidean distance from it (Felzenszwalb) stands in for elevation.
// Raising the tide floods the low ground first; the highest tide reached leaves a salt line.
import { getGL, program, quad, loadImage, texture, GLSL_COMMON } from './gl.js';

// Same data as the game (src/station-view/deploy-map.ts); x and y are percentages
const REGIONS = [
  { id: 'old-town', name: '沿海街区', area: '内陆 · 居住区', x: 32.5, y: 37, open: true, desc: '沿着街口进入居民楼，在楼道与院落间寻找物资。留意转角，把回家的路记清。', feat: ['沿海街区', '居民楼', '地下空间'] },
  { id: 'mall', name: '滨湾商场', area: '内陆 · 商业区', x: 44.5, y: 52.5, open: true, desc: '卷帘门后的卖场早已失去秩序。穿过货架与中庭，在两层商场和露台之间寻找撤离路线。', feat: ['两层卖场', '室外露台', '室内搜刮'] },
  { id: 'hospital', name: '县医院', area: '内陆 · 医疗区', x: 18.5, y: 21.5, side: 'l', desc: '仍在有限运转的门诊、病房与隔离区。医护守着药库，也守着最后的救治顺序。', feat: ['门诊', '药库', '隔离区'] },
  { id: 'old-hospital', name: '县医院旧址', area: '内陆 · 废弃院区', x: 14, y: 51, desc: '搬迁后的病房与档案室被拾荒者占据。封闭地下层里，旧病例仍等待有人读懂。', feat: ['废弃病房', '档案室', '封闭地下层'] },
  { id: 'factory', name: '工厂区', area: '内陆 · 工业区', x: 46.5, y: 14, desc: '停工的厂房、铁路货场与维修车间连成一片。设备之间的窄路通向开阔而危险的装卸场。', feat: ['机械厂', '维修车间', '铁路货场'] },
  { id: 'laboratory', name: '隐秘实验室', area: '内陆 · 地下设施', x: 66.5, y: 13, desc: '停产厂房之下，样本库与封闭试验区仍藏着灾难被放大的证据。', feat: ['样本库', '设备间', '封闭试验区'] },
  { id: 'highway', name: '西线国道', area: '内陆 · 县境通道', x: 29.5, y: 8, side: 'l', desc: '废弃车队停在加油站与检查口之间。县内高地上的公路，曾是通往外面的方向。', feat: ['加油站', '服务区', '检查口'] },
  { id: 'market', name: '水产市场', area: '沿海 · 冷链交易区', x: 26, y: 70.5, side: 'l', desc: '交易厅已经安静，冷库和维修仓里仍可能留下补给。这里曾是水产站最熟悉的一条采购线。', feat: ['交易厅', '冷库', '维修仓'] },
  { id: 'observatory', name: '观测站与泵房', area: '沿海 · 海堤设施', x: 61.5, y: 69, desc: '观测仪记录潮位，泵房守着海堤。沿维护道路寻找样本室与配电所，拼出海的规律。', feat: ['观测主楼', '样本室', '海堤泵房'] },
  { id: 'lighthouse', name: '灯塔岬角', area: '沿海 · 岬角高地', x: 85.5, y: 80.5, side: 'l', desc: '灯塔立在海边高地，废炮台与宿舍沿坡道分布。有人把这里当作庇护，也有人把它当作信仰。', feat: ['灯塔', '山间坡道', '地下设备间'] },
  { id: 'harbor', name: '旧渔港', area: '海运 · 港口仓储', x: 66.5, y: 46, sea: true, desc: '修船棚、燃油库和集装箱围着老码头。船册与运输记录，或许能解释那些不该抵港的货物。', feat: ['船务所', '燃油库', '集装箱码头'] },
  { id: 'freighter', name: '远汐号', area: '海运 · 搁浅货轮', x: 88, y: 57.5, side: 'l', sea: true, desc: '货轮歪着船身留在港外。狭窄舱道连着甲板、机舱和污染货舱，货运清单记录着最后一次航行。', feat: ['甲板', '船员舱', '货舱'] },
];
const BASE = { x: 35, y: 87.5 };
const FW = 384, FH = 256;   // distance field resolution

const VS = /* glsl */`#version 300 es
layout(location=0) in vec2 a_pos;
out vec2 v_uv;
void main() { v_uv = a_pos; gl_Position = vec4(a_pos * 2.0 - 1.0, 0.0, 1.0); }`;

const FS = /* glsl */`#version 300 es
precision highp float;
uniform sampler2D u_map;
uniform sampler2D u_h;
uniform float u_tide;     // current tide (elevation 0..1)
uniform float u_max;      // highest tide reached
uniform float u_time;
uniform vec2 u_res;
uniform vec2 u_sel;       // selected region uv
in vec2 v_uv;
out vec4 o;
${GLSL_COMMON}
void main() {
  vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);
  vec3 c = texture(u_map, uv).rgb;
  // pixel grid (one cell of the 768 x 512 map)
  vec2 g = (floor(uv * vec2(768.0, 512.0)) + 0.5) / vec2(768.0, 512.0);
  float h = texture(u_h, g).r;
  float n = hash(floor(uv * vec2(192.0, 128.0)));
  float sea = step(h, 0.0005);
  // open sea: faint glitter
  float shimmer = step(0.94, hash(floor(uv * vec2(384.0, 256.0)) + floor(u_time * 2.0)));
  c += sea * shimmer * 0.06;
  float tide = u_tide + (n - 0.5) * 0.012;
  float wet = step(h, tide) * (1.0 - sea);
  if (wet > 0.0) {
    float depth = clamp((tide - h) / 0.08, 0.0, 1.0);
    vec3 murk = mix(vec3(0.30, 0.42, 0.38), vec3(0.11, 0.25, 0.30), depth);
    c = mix(c, murk, 0.62 + 0.3 * depth);
    // drifting scum
    float drift = step(0.93, hash(floor((uv + vec2(u_time * 0.004, 0.0)) * vec2(256.0, 170.0))));
    c += drift * 0.08 * (1.0 - depth);
    // surf line
    float front = 1.0 - smoothstep(0.0, 0.012, tide - h);
    c = mix(c, vec3(0.86, 0.9, 0.84), front * (0.55 + 0.45 * sin(u_time * 3.0 + uv.x * 80.0)) * 0.7);
  }
  // salt line: a pale thin line at the highest tide (visible only on dry land)
  float salt = (1.0 - wet) * (1.0 - sea) * (1.0 - smoothstep(0.004, 0.011, abs(h - u_max))) * step(0.02, u_max);
  salt *= 0.65 + 0.35 * step(0.35, hash(floor(uv * vec2(256.0, 170.0))));
  c = mix(c, vec3(0.96, 0.92, 0.66), salt * 0.85);
  // selected region: a scanning ring
  vec2 d = (uv - u_sel) * vec2(1.5, 1.0);
  float r = length(d);
  float ring = fract(u_time * 0.45);
  c += vec3(0.9, 0.7, 0.3) * (1.0 - smoothstep(0.0, 0.004, abs(r - ring * 0.12))) * (1.0 - ring) * 0.5;
  c *= 1.0 - 0.5 * smoothstep(0.03, 0.4, r) * 0.25;
  // terminal scanline
  float scan = fract(uv.y - u_time * 0.06);
  c += vec3(0.6, 0.8, 0.7) * smoothstep(0.985, 1.0, scan) * 0.05;
  c *= 0.94 + 0.06 * step(0.5, fract(gl_FragCoord.y / 3.0));
  o = vec4(c, 1.0);
}`;

/** Felzenszwalb 1-D squared distance transform */
function edt1d(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const dq = q - v[k]; d[q] = dq * dq + f[v[k]]; }
}
function edt(grid, w, h) {
  const n = Math.max(w, h), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) grid[y * w + x] = Math.sqrt(d[x]);
  }
  return grid;
}

/** Elevation: higher the farther from the sea; woods and rock are raised a little more. */
function heightField(img) {
  const cv = document.createElement('canvas');
  cv.width = FW; cv.height = FH;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0, FW, FH);
  const px = cx.getImageData(0, 0, FW, FH).data;
  const N = FW * FH, grid = new Float64Array(N), rough = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
    const water = b > r + 28 && b > g - 6 && b > 60;
    grid[i] = water ? 0 : 1e12;
    const lum = (r + g + b) / 765;
    const forest = g > r + 8 && g > b && lum < 0.36 ? 1 : 0;
    const rock = Math.abs(r - g) < 14 && Math.abs(g - b) < 18 && lum > 0.32 && lum < 0.62 ? 0.6 : 0;
    rough[i] = forest + rock;
  }
  // Only the largest connected water body is the sea; rivers and ponds are not sources of the tide
  const comp = new Int32Array(N).fill(-1), queue = new Int32Array(N);
  let best = -1, bestSize = 0, label = 0;
  for (let s = 0; s < N; s++) {
    if (grid[s] !== 0 || comp[s] !== -1) continue;
    let head = 0, tail = 0; queue[tail++] = s; comp[s] = label;
    while (head < tail) {
      const i = queue[head++], x = i % FW, y = (i / FW) | 0;
      const nb = [x > 0 ? i - 1 : -1, x < FW - 1 ? i + 1 : -1, y > 0 ? i - FW : -1, y < FH - 1 ? i + FW : -1];
      for (const j of nb) if (j >= 0 && grid[j] === 0 && comp[j] === -1) { comp[j] = label; queue[tail++] = j; }
    }
    if (tail > bestSize) { bestSize = tail; best = label; }
    label++;
  }
  for (let i = 0; i < N; i++) if (grid[i] === 0 && comp[i] !== best) grid[i] = 1e12;
  edt(grid, FW, FH);
  // box blur the roughness so it does not speckle
  const blur = new Float32Array(N), R = 6;
  for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
    let s = 0, c = 0;
    for (let dy = -R; dy <= R; dy += 2) for (let dx = -R; dx <= R; dx += 2) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= FW || yy >= FH) continue;
      s += rough[yy * FW + xx]; c++;
    }
    blur[y * FW + x] = s / c;
  }
  const out = new Float32Array(N);
  let max = 0;
  for (let i = 0; i < N; i++) { out[i] = grid[i] * (1 + 1.1 * blur[i]); if (out[i] > max) max = out[i]; }
  const norm = Math.min(max, 120);
  for (let i = 0; i < N; i++) out[i] = Math.min(1, out[i] / norm);
  return out;
}

export async function createCounty({ root, reducedMotion = false }) {
  const mapEl = root.querySelector('#countyMap');
  const canvas = root.querySelector('#mapCanvas');
  const pins = root.querySelector('#countyPins');
  const route = root.querySelector('#routePath');
  const slider = root.querySelector('#tide');
  const autoBtn = root.querySelector('#tideAuto');
  const el = id => root.querySelector('#' + id);
  const brief = { img: el('briefImg'), area: el('briefArea'), name: el('briefName'), desc: el('briefDesc'), feat: el('briefFeat'), state: el('briefState'), tide: el('briefTide') };

  const img = await loadImage('assets/map/county-terrain.webp');
  const H = heightField(img);
  const hAt = (x, y) => {   // x, y in percent
    const fx = Math.min(FW - 1, Math.max(0, Math.round(x / 100 * FW)));
    const fy = Math.min(FH - 1, Math.max(0, Math.round(y / 100 * FH)));
    return H[fy * FW + fx];
  };

  // ---- Pins ----
  let sel = REGIONS.find(r => r.id === 'mall');
  const nodes = new Map();
  for (const r of REGIONS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pin' + (r.open ? ' open' : '');
    b.dataset.side = r.side || 'r';
    b.style.setProperty('--x', r.x); b.style.setProperty('--y', r.y);
    b.innerHTML = `<i class="pin-mark"></i><span class="pin-label"><span>${r.name}</span><small>${r.open ? '可出击' : '暂未开发'}</small></span>`;
    b.setAttribute('aria-label', `${r.name}，${r.open ? '可出击' : '暂未开发'}`);
    b.addEventListener('click', () => select(r));
    b.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') select(r); });
    pins.append(b);
    nodes.set(r.id, b);
  }
  const base = document.createElement('div');
  base.className = 'pin pin-base';
  base.style.setProperty('--x', BASE.x); base.style.setProperty('--y', BASE.y);
  base.innerHTML = '<i class="pin-mark"></i><span class="pin-label"><span>滨科夫水产站</span><small>当前据点</small></span>';
  pins.append(base);

  function drawRoute(r) {
    const x0 = BASE.x * 1.5, y0 = BASE.y, x1 = r.x * 1.5, y1 = r.y;
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
    const bend = Math.min(18, len * 0.22);
    const cx = mx - dy / len * bend, cy = my + dx / len * bend;
    route.setAttribute('d', `M${x0.toFixed(2)} ${y0.toFixed(2)} Q${cx.toFixed(2)} ${cy.toFixed(2)} ${x1.toFixed(2)} ${y1.toFixed(2)}`);
    if (!reducedMotion && route.animate) {
      const L = route.getTotalLength();
      route.animate([{ strokeDashoffset: L, strokeDasharray: `${L} ${L}` }, { strokeDashoffset: 0, strokeDasharray: `${L} ${L}`, offset: 0.999 }, { strokeDasharray: '1.4 1.1' }], { duration: 650, easing: 'cubic-bezier(.2,.7,.1,1)' });
    }
  }
  let tideNow = 0;
  function tideWord(r) {
    if (r.sea) return null;                       // the harbour basin and the freighter are at sea already
    const h = hAt(r.x, r.y);
    if (h > tideNow) return null;
    return tideNow - h > 0.06 ? '没顶' : '浅水';
  }
  function fillBrief(r) {
    brief.area.textContent = r.area;
    brief.name.textContent = r.name;
    brief.desc.textContent = r.desc;
    brief.feat.innerHTML = r.feat.map(f => `<li>${f}</li>`).join('');
    brief.state.textContent = r.open ? '可出击' : '暂未开发';
    brief.state.className = 'px' + (r.open ? ' open' : '');
    updateBriefTide();
  }
  function updateBriefTide() {
    const w = tideWord(sel);
    brief.tide.textContent = w ? `水淹 · ${w}` : '干';
    brief.tide.className = 'px' + (w ? ' wet' : '');
  }
  function select(r, first = false) {
    if (r === sel && !first) return;
    nodes.get(sel.id)?.classList.remove('on');
    sel = r;
    nodes.get(r.id).classList.add('on');
    const next = `assets/map/${r.id}.webp`;
    if (!brief.img.src.endsWith(next)) {
      brief.img.classList.remove('swap');
      brief.img.src = next;
      brief.img.alt = `${r.name}情报示意图`;
      void brief.img.offsetWidth;
      if (!reducedMotion) brief.img.classList.add('swap');
    }
    fillBrief(r);
    drawRoute(r);
    kick();
  }

  // ---- WebGL ----
  const gl = getGL(canvas);
  let draw = null;
  if (gl) {
    const prog = program(gl, VS, FS);
    const vao = quad(gl);
    const tMap = texture(gl, img, { premultiply: false });
    const tH = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tH);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, FW, FH, 0, gl.RED, gl.FLOAT, H);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    mapEl.classList.add('gl');
    draw = (time) => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const W = Math.round(canvas.clientWidth * dpr), Hh = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== W || canvas.height !== Hh) { canvas.width = W; canvas.height = Hh; }
      gl.viewport(0, 0, W, Hh);
      gl.useProgram(prog.p);
      gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tMap); gl.uniform1i(prog.u.u_map, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tH); gl.uniform1i(prog.u.u_h, 1);
      gl.uniform1f(prog.u.u_tide, tideNow);
      gl.uniform1f(prog.u.u_max, maxTide);
      gl.uniform1f(prog.u.u_time, time);
      gl.uniform2f(prog.u.u_res, W, Hh);
      gl.uniform2f(prog.u.u_sel, sel.x / 100, sel.y / 100);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
  }

  // ---- Tide ----
  let auto = !reducedMotion, maxTide = 0, running = false, raf = 0, t0 = performance.now(), lastPins = 0;
  const baseTide = () => 0.55 * Math.pow(slider.value / 100, 1.35);
  function setAutoLabel() { autoBtn.textContent = `潮汐呼吸 · ${auto ? '开' : '关'}`; autoBtn.setAttribute('aria-pressed', String(auto)); }
  setAutoLabel();
  autoBtn.addEventListener('click', () => { auto = !auto; setAutoLabel(); kick(); });
  slider.addEventListener('input', () => kick());

  function updatePins() {
    for (const r of REGIONS) {
      const w = tideWord(r);
      const b = nodes.get(r.id);
      b.classList.toggle('flood', !!w);
      b.querySelector('small').textContent = w ? `水淹 · ${w}` : (r.open ? '可出击' : '暂未开发');
    }
    updateBriefTide();
  }
  function tick(now) {
    raf = 0;
    const time = (now - t0) / 1000;
    tideNow = Math.max(0, baseTide() + (auto ? 0.025 * Math.sin(time * 0.7) - 0.012 : 0));
    maxTide = Math.max(maxTide, tideNow);
    draw?.(time);
    if (now - lastPins > 220) { lastPins = now; updatePins(); }
    if (running && (auto || !reducedMotion)) raf = requestAnimationFrame(tick);
  }
  function kick() { if (!raf) raf = requestAnimationFrame(tick); }

  select(sel, true);
  return {
    start() { running = true; kick(); },
    stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; },
  };
}
