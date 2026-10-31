// Wires the sections together: scroll progress, HUD clock, task list, radio, extraction.
import { createPrologue } from './prologue.js';
import { createAudio } from './audio.js';
import { createThreats } from './threats.js';
import { createBench } from './bench.js';

const GAME_URL = 'play/';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const clamp01 = v => Math.min(1, Math.max(0, v));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const wide = matchMedia('(min-width: 821px)');
const audio = createAudio();

// ---------- Sound ----------
const soundBtn = $('#sound');
soundBtn.addEventListener('click', () => {
  const on = audio.toggle();
  soundBtn.setAttribute('aria-pressed', String(on));
});

// ---------- Toast ----------
const toastEl = $('#toast');
let toastTimer = 0;
function toast(text, ms = 2600) {
  toastEl.textContent = text;
  toastEl.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('on'), ms);
}

// ---------- Task list ----------
const tasks = $('#tasks'), tasksToggle = $('#tasksToggle'), taskCount = $('#taskCount');
const done = new Set();
function completeTask(id) {
  if (done.has(id)) return;
  done.add(id);
  const a = $(`[data-task="${id}"]`);
  a?.classList.add('done');
  const left = $$('[data-task]').length - done.size;
  tasksToggle.innerHTML = left ? `▸ 任务 · <span id="taskCount">${left}</span> 项未完成` : '▸ 任务 · 全部完成';
}
tasksToggle.addEventListener('click', e => {
  e.stopPropagation();
  const open = !tasks.classList.contains('open');
  tasks.classList.toggle('open', open);
  tasksToggle.setAttribute('aria-expanded', String(open));
});
document.addEventListener('click', e => { if (!tasks.contains(e.target)) { tasks.classList.remove('open'); tasksToggle.setAttribute('aria-expanded', 'false'); } });
$$('.hud-task-list a').forEach(a => a.addEventListener('click', () => { tasks.classList.remove('open'); tasksToggle.setAttribute('aria-expanded', 'false'); }));

// ---------- Radio ----------
const RADIO = '水产站，水产站。今天第十七天。早潮四点五十，晚潮五点二十，都比表上晚。西边国道还在水里。出门的人，五点前回来。';
const radioText = $('#radioText');
let radioI = 0, radioPaused = false;
function radioStep() {
  if (radioPaused) { setTimeout(radioStep, 400); return; }
  if (radioI <= RADIO.length) {
    radioText.textContent = RADIO.slice(0, radioI);
    if (radioI > 0 && !/[，。]/.test(RADIO[radioI - 1])) audio.tick();
    const ch = RADIO[radioI - 1];
    radioI++;
    setTimeout(radioStep, /[，。]/.test(ch) ? 360 : 55 + Math.random() * 50);
    if (radioI > RADIO.length) completeTask('top');
  } else {
    radioI = 0;
    setTimeout(radioStep, 6000);
  }
}
if (reduced) { radioText.textContent = RADIO; completeTask('top'); } else setTimeout(radioStep, 900);

// ---------- Prologue ----------
const canvas = $('#stage');
const prologueEl = $('#top');
const hero = $('#hero'), radio = $('#radio'), cue = $('#scrollCue');
const lines = $$('.story-line'), day = $('.story-day'), story = $('#story');
const tideline = $('#tideline'), tideValue = $('#tideValue');
let prologue = null, prologueVisible = true;
createPrologue(canvas, { reducedMotion: reduced, onThunder: () => audio.thunder(Math.random()) })
  .then(p => {
    prologue = p;
    canvas.classList.add('ready');
    p.setProgress(progressOf(prologueEl));
    if (prologueVisible && !document.hidden) p.start();
  })
  .catch(err => { console.error(err); canvas.classList.add('gone'); });

addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse' || !prologue) return;
  prologue.setPointer((e.clientX / innerWidth - 0.5) * 2, (e.clientY / innerHeight - 0.5) * 2);
}, { passive: true });

new IntersectionObserver(([en]) => {
  prologueVisible = en.isIntersecting;
  canvas.classList.toggle('gone', !prologueVisible);
  if (!prologue) return;
  if (prologueVisible && !document.hidden) prologue.start(); else prologue.stop();
}).observe(prologueEl);

function progressOf(el) {
  const r = el.getBoundingClientRect();
  return clamp01(-r.top / Math.max(1, r.height - innerHeight));
}

function updatePrologue() {
  const P = progressOf(prologueEl);
  prologue?.setProgress(P);
  const h = clamp01((P - 0.015) / 0.1);
  hero.style.opacity = String(1 - h);
  hero.style.translate = `0 ${-h * 60}px`;
  hero.style.visibility = h >= 1 ? 'hidden' : '';
  radio.style.opacity = String(1 - clamp01((P - 0.01) / 0.08));
  radio.style.visibility = P > 0.09 ? 'hidden' : '';
  radioPaused = P > 0.09;
  cue.style.opacity = String(1 - clamp01(P / 0.03));
  // story
  const inStory = P > 0.355 && P < 0.935;
  day.classList.toggle('on', inStory);
  story.classList.toggle('on', inStory);
  let active = -1;
  lines.forEach((l, i) => { if (P >= parseFloat(l.dataset.at)) active = i; });
  if (!inStory) active = P >= 0.935 ? lines.length : -1;
  lines.forEach((l, i) => { l.classList.toggle('on', i === active); l.classList.toggle('past', i < active); });
  tideline.classList.toggle('on', P > 0.43 && P < 0.92);
  if (prologue) tideValue.textContent = `+${prologue.tideMeters().toFixed(1)} m`;
}

// ---------- Raid loop (horizontal) ----------
const loopEl = $('#loop'), steps = $('#loopSteps'), stepEls = $$('.loop-step'), loopBar = $('#loopBar');
function updateLoop() {
  if (!wide.matches) { steps.style.transform = ''; return; }
  const L = progressOf(loopEl);
  const t = clamp01((L - 0.04) / 0.9);
  const rail = steps.parentElement.clientWidth;
  const max = Math.max(0, steps.scrollWidth - rail);
  steps.style.transform = `translate3d(${-t * max}px, 0, 0)`;
  const idx = Math.round(t * (stepEls.length - 1));
  stepEls.forEach((s, i) => { s.classList.toggle('on', i === idx); if (i <= idx && L > 0) s.classList.add('seen'); });
  loopBar.style.transform = `scaleX(${t})`;
}
const stepIO = new IntersectionObserver(ens => ens.forEach(en => {
  if (wide.matches) return;
  en.target.classList.toggle('on', en.isIntersecting);
  if (en.isIntersecting) en.target.classList.add('seen');
}), { threshold: 0.35 });
stepEls.forEach(s => stepIO.observe(s));

// ---------- Gunsmith ----------
const benchEl = $('#bench');
const bench = createBench(benchEl, { reducedMotion: reduced, onSnap: i => audio.snap(i) });
function updateBench() {
  const r = benchEl.getBoundingClientRect();
  if (r.bottom < -100 || r.top > innerHeight + 100) return;
  bench.update(progressOf(benchEl));
}

// ---------- HUD clock (the whole page is one 10-minute raid) ----------
const clock = $('#clock'), clockBar = $('#clockBar');
let lastElapsed = 0;
function updateClock() {
  const max = document.documentElement.scrollHeight - innerHeight;
  const G = clamp01(scrollY / Math.max(1, max));
  const elapsed = G * 600, left = Math.max(0, 600 - elapsed);
  const m = Math.floor(left / 60), s = Math.floor(left % 60);
  clock.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  clockBar.style.transform = `scaleX(${1 - G})`;
  if (lastElapsed < 270 && elapsed >= 270) { toast('04:30 电台预警，离开浅滩。'); audio.warn(); clock.classList.add('warn'); setTimeout(() => clock.classList.remove('warn'), 3000); }
  if (lastElapsed < 300 && elapsed >= 300) toast('05:00 潮位变化，高架路与海堤仍可通行。', 3200);
  lastElapsed = elapsed;
}

// ---------- Scroll loop ----------
let ticking = false;
function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    updatePrologue(); updateLoop(); updateBench(); updateClock(); updateExtractScene();
    if (holding && Math.abs(scrollY - holdY) > 6) interruptHold();
  });
}
addEventListener('scroll', onScroll, { passive: true });
addEventListener('resize', () => { prologue?.resize(); onScroll(); });
onScroll();

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { prologue?.stop(); county?.stop(); }
  else { if (prologueVisible) prologue?.start(); if (countyVisible) county?.start(); }
});

// ---------- Tasks: done once seen ----------
const taskIO = new IntersectionObserver(ens => ens.forEach(en => {
  if (en.isIntersecting && en.target.id !== 'extract') completeTask(en.target.id);
}), { threshold: 0.3 });
['loop', 'county', 'threats', 'people', 'bench'].forEach(id => taskIO.observe(document.getElementById(id)));

// ---------- County map (loaded when near) ----------
let county = null, countyVisible = false;
const countyEl = $('#county');
new IntersectionObserver(([en]) => {
  countyVisible = en.isIntersecting;
  if (countyVisible && !county) {
    county = 'loading';
    import('./county.js').then(m => m.createCounty({ root: countyEl, reducedMotion: reduced })).then(c => {
      county = c;
      if (countyVisible) c.start();
    }).catch(err => { console.error(err); county = null; });
  } else if (county && county !== 'loading') {
    if (countyVisible) county.start(); else county.stop();
  }
}, { rootMargin: '300px 0px' }).observe(countyEl);

// ---------- Enemies and station people ----------
createThreats($('#threats'));

// ---------- Counting numbers ----------
const featIO = new IntersectionObserver(ens => ens.forEach(en => {
  if (!en.isIntersecting) return;
  const card = en.target;
  featIO.unobserve(card);
  card.classList.add('seen');
  const num = card.querySelector('[data-count]');
  if (!num || reduced) return;
  const to = +num.dataset.count, t0 = performance.now();
  const step = now => {
    const k = clamp01((now - t0) / 900);
    num.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 3))));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}), { threshold: 0.4 });
$$('.feat').forEach(f => featIO.observe(f));

// ---------- Shortcuts ----------
addEventListener('keydown', e => {
  if (e.target.closest?.('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'm' || k === 'g') { $('#county').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' }); toast(k === 'g' ? '出击准备' : '地图'); }
});

// ---------- Extraction scene parallax (Sol's three layers) ----------
const extractScene = $('#extractScene');
if (!reduced) {
  addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse') extractScene.style.setProperty('--ex', ((e.clientX / innerWidth - 0.5) * 2).toFixed(3));
  }, { passive: true });
}
function updateExtractScene() {
  if (reduced) return;
  const r = $('#extract').getBoundingClientRect();
  if (r.top > innerHeight || r.bottom < 0) return;
  extractScene.style.setProperty('--ey', clamp01(r.top / innerHeight).toFixed(3));
}

// ---------- Extraction: hold for 3 seconds ----------
const extractEl = $('#extract'), ring = $('#extractRing'), fill = $('#extractFill'), btn = $('#extractBtn');
const sub = $('#extractSub'), title = $('#extractTitle');
const SUB = sub.textContent, RING = 553;
let holding = false, holdP = 0, holdY = 0, holdRaf = 0, holdLast = 0, extractVisible = false, extracted = false;
new IntersectionObserver(([en]) => { extractVisible = en.isIntersecting; }, { threshold: 0.5 }).observe(extractEl);
function paintHold() {
  ring.style.strokeDashoffset = String(RING * (1 - holdP));
  fill.style.transform = `scaleX(${holdP})`;
}
function holdLoop(now) {
  const dt = Math.min(0.1, (now - holdLast) / 1000); holdLast = now;
  if (holding) {
    holdP = Math.min(1, holdP + dt / 3);
    audio.holdTone(holdP);
    if (holdP >= 1) { finishExtract(); return; }
  } else holdP = Math.max(0, holdP - dt * 2.5);
  paintHold();
  holdRaf = holding || holdP > 0 ? requestAnimationFrame(holdLoop) : 0;
}
function startHold() {
  if (extracted || holding) return;
  holding = true; holdY = scrollY; holdLast = performance.now();
  sub.textContent = '撤离中……别动。';
  btn.querySelector('span').textContent = '撤离中';
  if (!holdRaf) holdRaf = requestAnimationFrame(holdLoop);
}
function endHold() {
  if (!holding) return;
  holding = false;
  if (!extracted) { sub.textContent = SUB; btn.querySelector('span').textContent = '按住撤离'; }
}
function interruptHold() {
  holding = false; holdP = 0; paintHold();
  sub.textContent = '移动中，撤离中断。停稳再按。';
  btn.querySelector('span').textContent = '按住撤离';
  audio.warn();
}
function finishExtract() {
  extracted = true; holding = false; holdP = 1; paintHold();
  extractEl.classList.add('done');
  title.textContent = '撤离成功';
  sub.textContent = '带回来了。正在返回水产站……';
  completeTask('extract');
  audio.success();
  if (!reduced) { const f = document.createElement('div'); f.className = 'extract-flash'; document.body.append(f); }
  setTimeout(() => { location.href = GAME_URL; }, 1200);
}
btn.addEventListener('pointerdown', e => { e.preventDefault(); btn.setPointerCapture?.(e.pointerId); startHold(); });
btn.addEventListener('pointerup', endHold);
btn.addEventListener('pointercancel', endHold);
btn.addEventListener('lostpointercapture', endHold);
btn.addEventListener('contextmenu', e => e.preventDefault());
btn.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); startHold(); } });
btn.addEventListener('keyup', e => { if (e.key === ' ' || e.key === 'Enter') endHold(); });
addEventListener('keydown', e => { if (e.key.toLowerCase() === 'e' && !e.repeat && extractVisible && !e.target.closest?.('input')) startHold(); });
addEventListener('keyup', e => { if (e.key.toLowerCase() === 'e') endHold(); });
addEventListener('wheel', () => { if (holding) interruptHold(); }, { passive: true });
