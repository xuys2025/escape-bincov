// Laoshuan's workbench: an exploded M4A1 "stable" build that reassembles part by part as the page scrolls.
// Part images and anchors: tests/fixtures/gunsmith-assemblies.json (the workbench assembly Sol approved: mb4a1 / stable / w).
const GUN = { w: 194, h: 50 };
// x, y: top-left when assembled; dx, dy: offset when exploded (gun pixels); lx, ly: label direction from the part centre
const PARTS = [
  { key: 'gs-s02-w', slot: '枪托', name: 'AR 稳定托', x: 0, y: 13, w: 44, h: 24, dx: -34, dy: -6, lx: -0.6, ly: -1 },
  { key: 'gs-p02-w', slot: '握把', name: 'AR 稳握把', x: 57, y: 27, w: 16, h: 22, dx: -12, dy: 30, lx: -1, ly: 0.4 },
  { key: 'gs-mb4a1-mag-factory-w', slot: '弹匣', name: '原厂弹匣', x: 87, y: 27, w: 20, h: 32, dx: 2, dy: 40, lx: 0.2, ly: 1 },
  { key: 'gs-b08-w', slot: '枪管', name: 'AR 精确枪管组', x: 107, y: 15, w: 72, h: 10, dx: 34, dy: 6, lx: 0.5, ly: 1 },
  { key: 'gs-mb4a1-receiver-w', slot: '机匣', name: 'M4A1 模块步枪', x: 43, y: 15, w: 68, h: 16, dx: 0, dy: 0, lx: 0, ly: 0, fixed: true },
  { key: 'gs-h01-w', slot: '护木', name: 'AR 短导轨护木', x: 107, y: 19, w: 40, h: 16, dx: 16, dy: -24, lx: 0.4, ly: -1 },
  { key: 'gs-f01-w', slot: '前握把', name: '短垂直前握把', x: 121, y: 34, w: 10, h: 16, dx: 12, dy: 34, lx: 0.6, ly: 1 },
  { key: 'gs-o08-w', slot: '瞄具', name: '轻型远距镜', x: 52, y: 0, w: 44, h: 16, dx: -4, dy: -32, lx: -0.3, ly: -1 },
  { key: 'gs-m06-w', slot: '枪口', name: '步枪制退器', x: 178, y: 15, w: 16, h: 12, dx: 62, dy: 2, lx: 1, ly: -0.6 },
];
// Reassembly order
const ORDER = ['gs-s02-w', 'gs-p02-w', 'gs-mb4a1-mag-factory-w', 'gs-b08-w', 'gs-h01-w', 'gs-f01-w', 'gs-o08-w', 'gs-m06-w'];
// Trade-off directions of this build (modifiers in src/gunsmith/catalog.ts: < 1 is better, > 1 is worse)
const EFFECTS = [
  ['up', '精瞄更准', '远距镜、精确枪管'], ['up', '连发更稳', '稳定托、制退器、前握把'], ['up', '后坐更小', '稳定托、制退器、前握把'],
  ['down', '举枪更慢', '稳定托、精确枪管、远距镜'], ['down', '枪声更响', '制退器'],
];

const clamp01 = v => Math.min(1, Math.max(0, v));
const easeOut = t => 1 - Math.pow(1 - t, 3);
const easeBack = t => { const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

export function createBench(root, { onSnap = () => {}, reducedMotion = false } = {}) {
  const board = root.querySelector('#benchBoard');
  const gun = root.querySelector('#benchGun');
  const leaders = root.querySelector('#benchLeaders');
  const labels = root.querySelector('#benchLabels');
  const stats = root.querySelector('#benchStats');
  const NS = 'http://www.w3.org/2000/svg';

  const items = PARTS.map(p => {
    const img = new Image();
    img.src = `assets/gun/${p.key}.png`;
    img.alt = '';
    img.className = 'bench-part';
    img.style.setProperty('--x', p.x); img.style.setProperty('--y', p.y);
    img.style.setProperty('--w', p.w); img.style.setProperty('--h', p.h);
    img.draggable = false;
    gun.append(img);
    let label = null, line = null, dot = null;
    if (!p.fixed) {
      label = document.createElement('div');
      label.className = 'bench-label';
      label.innerHTML = `${p.name}<small>${p.slot}</small>`;
      labels.append(label);
      line = document.createElementNS(NS, 'line'); leaders.append(line);
      dot = document.createElementNS(NS, 'circle'); dot.setAttribute('r', '2.5'); leaders.append(dot);
    }
    return { p, img, label, line, dot, snapped: false, i: ORDER.indexOf(p.key) };
  });
  stats.innerHTML = EFFECTS.map(([k, t, why]) => `<div class="bench-chip ${k}" title="${why}"><b class="px">${k === 'up' ? '▲' : '▼'} ${t}</b><small>${why}</small></div>`).join('')
    + '<p class="bench-note">取舍方向来自游戏改枪目录；实际数值在工作台上看，后坐与举枪改善有护栏上限。</p>';

  let last = -1;
  function update(P) {
    if (Math.abs(P - last) < 0.0005) return;
    const fwd = P > last;
    last = P;
    const s = parseFloat(getComputedStyle(gun).getPropertyValue('--s')) || 4;
    const gr = gun.getBoundingClientRect(), br = board.getBoundingClientRect();
    const gx = gr.left - br.left, gy = gr.top - br.top;
    const arrive = easeOut(clamp01(P / 0.16));                  // parts slide in onto the bench
    const labelA = clamp01((P - 0.08) / 0.1) * (1 - clamp01((P - 0.5) / 0.08));
    for (const it of items) {
      const { p } = it;
      let k = 1;                                                // 1 = exploded, 0 = assembled
      if (!p.fixed) {
        const a = 0.5 + it.i * 0.042, b = a + 0.07;
        const t = clamp01((P - a) / (b - a));
        k = 1 - (reducedMotion ? t : easeBack(t));
        const snapped = t >= 1;
        if (snapped && !it.snapped && fwd) onSnap(it.i);
        it.snapped = snapped;
      }
      const far = (1 - arrive) * 2.2;
      const ex = p.dx * (k + far), ey = p.dy * (k + far);
      const rot = p.fixed ? 0 : (k * (p.dx > 0 ? 1 : -1) * 4 + far * 10);
      it.img.style.transform = `translate(${ex * s}px, ${ey * s}px) rotate(${rot}deg)`;
      it.img.style.opacity = String(p.fixed ? arrive : Math.min(1, arrive * 1.4));
      if (!it.label) continue;
      const cx = gx + (p.x + p.w / 2 + ex) * s, cy = gy + (p.y + p.h / 2 + ey) * s;
      const len = Math.hypot(p.lx, p.ly) || 1;
      const reach = 22 * s * 0.75 + 18;
      const lx = cx + p.lx / len * reach, ly = cy + p.ly / len * reach * 0.7;
      const la = labelA * clamp01(k * 3);
      it.label.style.transform = `translate(${lx}px, ${ly}px) translate(-50%, -50%)`;
      it.label.style.opacity = String(la);
      it.line.setAttribute('x1', cx); it.line.setAttribute('y1', cy);
      it.line.setAttribute('x2', lx); it.line.setAttribute('y2', ly);
      it.line.style.opacity = String(la);
      it.dot.setAttribute('cx', cx); it.dot.setAttribute('cy', cy);
      it.dot.style.opacity = String(la);
    }
    const done = clamp01((P - 0.86) / 0.08);
    stats.style.opacity = String(done);
    stats.style.transform = `translateY(${(1 - done) * 16}px)`;
    gun.classList.toggle('done', done > 0.5);
  }
  return { update };
}
