// Prologue: the game's layered title art rebuilt in WebGL2 as the rainy radio room.
// A scroll-driven camera: indoors -> through the doorway -> the pier -> the tide rises over the picture.
import { getGL, program, quad, loadImage, texture, target, GLSL_COMMON } from './gl.js';

const SW = 960, SH = 540;           // logical title coordinates (same as src/title/layout.ts in the game)
const ART = 1.5;                    // one art pixel = 1.5 logical pixels (640x360 grid)
const DIR = 'assets/title/';

// a: perspective factor of the dolly (larger is nearer); par: pointer parallax in logical pixels
const LAYERS = [
  { n: 'sky', f: 'title-sky-ready', x: -2, y: -2, w: 964, h: 544, g: 'bg', a: 0.22, par: 0.6 },
  { n: 'harbor', f: 'title-harbor-ready', x: -4, y: -3, w: 968, h: 546, g: 'bg', a: 0.28, par: 1.2, wave: true },
  { n: 'fogHigh', f: 'title-fog-high-new', x: 0, y: 158, w: 320, h: 44, g: 'bg', a: 0.29, par: 1.4, tile: true, drift: 3.5 },
  { n: 'fogLow', f: 'title-fog-low-new', x: 0, y: 200, w: 384, h: 40, g: 'bg', a: 0.30, par: 1.6, tile: true, drift: -5.5 },
  { fx: 'lights' },
  { n: 'boat', f: 'title-boat-master-v3', x: 337, y: 62, w: 164, h: 232, g: 'bg', a: 0.31, par: 2, bob: 1 },
  { n: 'mooring', f: 'title-mooring-master-v3', x: 344, y: 232, w: 152, h: 62, g: 'bg', a: 0.31, par: 2, frames: 3, fps: 1.6, bob: 0.5 },
  { n: 'pier', f: 'title-pier-master-v3', x: 0, y: 28, w: 960, h: 540, g: 'bg', a: 0.36, par: 2.6 },
  { fx: 'weather' },
  { n: 'room', f: 'title-room-ready', x: -6, y: -4, w: 972, h: 548, g: 'fg', a: 0.86, par: 5 },
  { n: 'lamp', f: 'title-lamp-master-v3', x: 551, y: -5, w: 148, h: 116, g: 'fg', a: 0.875, par: 6, frames: 5, frame: 2, sway: true },
  { n: 'light', f: 'title-light-new', x: 452, y: 96, w: 360, h: 300, g: 'fg', a: 0.875, par: 6, add: true, sway: true, flicker: true },
  { n: 'desk', f: 'title-desk-master-v3', x: 382, y: 232, w: 588, h: 314, g: 'fg', a: 0.92, par: 9 },
  { n: 'radio', f: 'title-radio-fx-new', x: 651, y: 301, w: 16, h: 8, g: 'fg', a: 0.92, par: 9, frames: 4, fps: 5 },
  { n: 'chair', f: 'title-chair-master-v3', x: 234, y: 365, w: 352, h: 182, g: 'fg', a: 0.95, par: 12 },
  { n: 'fore', f: 'title-fore-master-v3', x: 785, y: -11, w: 200, h: 562, g: 'fg', a: 0.985, par: 16 },
];
const LAMP_PIVOT = [626, 0];
const HORIZON = 196;
const DOOR = [423, 222];
// glazed openings (the door stands open and has no glass)
const GLASS = [
  [736, 56, 204, 214], [608, 75, 109, 178], [606, 0, 112, 57], [735, 0, 206, 33], [293, 61, 26, 162],
];
const FAR_LIGHTS = [[425, 178, 0], [642, 182, 0], [680, 176, 0], [766, 166, 0], [823, 184, 0], [856, 176, 0], [810, 153, 1]];

const VS = /* glsl */`#version 300 es
layout(location=0) in vec2 a_pos;
uniform vec2 u_res;
uniform vec4 u_rect;   // screen pixels x, y, w, h (top-left origin)
uniform vec3 u_rot;    // rotation centre x, y (screen pixels) and angle
uniform vec4 u_uv;
out vec2 v_uv;
void main() {
  vec2 p = u_rect.xy + a_pos * u_rect.zw;
  if (u_rot.z != 0.0) {
    vec2 d = p - u_rot.xy; float c = cos(u_rot.z), s = sin(u_rot.z);
    p = u_rot.xy + vec2(c * d.x - s * d.y, s * d.x + c * d.y);
  }
  v_uv = mix(u_uv.xy, u_uv.zw, a_pos);
  vec2 clip = p / u_res * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const FS_LAYER = /* glsl */`#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_size;
uniform float u_alpha;
uniform vec4 u_flash;    // rgb tint, a strength
uniform vec3 u_wave;     // amplitude (uv), horizon v, time
in vec2 v_uv;
out vec4 o;
${GLSL_COMMON}
void main() {
  vec2 uv = v_uv;
  if (u_wave.x > 0.0 && uv.y > u_wave.y) {
    float row = floor(uv.y * u_size.y / 3.0);
    float k = smoothstep(u_wave.y, u_wave.y + 0.08, uv.y);
    uv.x += (sin(row * 0.73 + u_wave.z * 1.6) + 0.5 * sin(row * 1.91 - u_wave.z * 2.3)) * u_wave.x * k;
  }
  vec4 c = sharpTex(u_tex, uv, u_size);
  c.rgb += u_flash.a * u_flash.rgb * c.a;
  o = c * u_alpha;
}`;

// Full-screen effects: far lights (additive) / sea water + rain
const FS_FX = /* glsl */`#version 300 es
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform int u_mode;          // 0 far lights, 1 weather
uniform vec3 u_harbor;       // harbour layer: Ox, Oy, S (screen = O + p*S)
uniform vec3 u_pier;         // pier layer
uniform vec3 u_lights[7];
uniform float u_water;       // water level (pier layer y); > 9000 means none
uniform float u_rain;        // rain amount 0..1
uniform float u_out;         // how far outside 0..1
uniform float u_flash;
out vec4 o;
${GLSL_COMMON}
float rainLayer(vec2 p, vec2 cell, float speed, float slant, float density, float len) {
  p.x += p.y * slant;
  p.y -= u_time * speed;
  vec2 id = floor(p / cell);
  float r = hash(id);
  if (r > density) return 0.0;
  vec2 f = p - id * cell;
  float x0 = floor(hash(id + 2.7) * (cell.x - 1.0));
  float y0 = hash(id + 5.1) * (cell.y - len);
  return step(x0, f.x) * step(f.x, x0 + 1.0) * step(y0, f.y) * step(f.y, y0 + len) * (0.6 + 0.4 * hash(id + 9.3));
}
void main() {
  vec2 fc = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);
  if (u_mode == 0) {
    vec2 p = (fc - u_harbor.xy) / u_harbor.z;
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 7; i++) {
      vec3 L = u_lights[i];
      vec2 d = p - L.xy;
      float fl = 0.72 + 0.28 * sin(u_time * (2.0 + float(i) * 0.37) + float(i) * 1.7);
      float g = exp(-dot(d, d) / 9.0) * 0.9 + exp(-dot(d, d) / 90.0) * 0.18;
      g += exp(-d.y * d.y / 0.8) * exp(-abs(d.x) / 7.0) * 0.12;
      vec3 c = L.z > 0.5 ? vec3(1.0, 0.25, 0.18) : vec3(1.0, 0.76, 0.42);
      acc += c * g * fl;
    }
    o = vec4(acc * (1.0 + u_flash), 0.0);
    return;
  }
  vec2 pp = (fc - u_pier.xy) / u_pier.z;          // pier layer coordinates
  vec2 q = floor(pp / ${ART}) * ${ART};
  vec4 col = vec4(0.0);
  // ---- Sea water ----
  if (u_water < 9000.0) {
    float surf = u_water + sin(q.x * 0.045 + u_time * 1.3) * 2.2 + sin(q.x * 0.13 - u_time * 2.1) * 1.1;
    surf = floor(surf / ${ART}) * ${ART};
    float top = (0.0 - u_pier.y) / u_pier.z;      // top edge of the screen
    if (q.y >= surf) {
      float depth = q.y - surf;
      vec3 shallow = vec3(0.105, 0.215, 0.225), deep = vec3(0.028, 0.075, 0.09);
      vec3 c = mix(shallow, deep, clamp(depth / 160.0, 0.0, 1.0));
      // glitter bands
      float band = step(0.86, hash(vec2(floor(q.y / 3.0), floor((q.x + sin(q.y * 0.21 + u_time * 1.4) * 4.0) / 9.0))));
      c += band * vec3(0.30, 0.42, 0.42) * (1.0 - clamp(depth / 90.0, 0.0, 1.0)) * 0.55;
      // reflection of the station's yellow light
      float glowX = 210.0;
      float refl = exp(-pow((q.x - glowX + sin(q.y * 0.4 + u_time * 2.0) * 3.0) / 10.0, 2.0)) * step(0.35, hash(vec2(floor(q.y / 3.0), floor(u_time * 6.0))));
      c += refl * vec3(0.55, 0.38, 0.14) * (1.0 - clamp(depth / 120.0, 0.0, 1.0));
      // raindrop ripples
      vec2 rc = floor(q / 12.0);
      float rt = fract(u_time * 0.9 + hash(rc));
      vec2 rcen = rc * 12.0 + 6.0 + (vec2(hash(rc + 1.3), hash(rc + 4.1)) - 0.5) * 6.0;
      float rr = length((q - rcen) * vec2(1.0, 2.4));
      float under = clamp((top - surf) / 40.0, 0.0, 1.0);
      float ring = step(abs(rr - rt * 6.0), 0.8) * (1.0 - rt) * step(0.5, hash(rc + 7.7)) * (1.0 - under);
      c += ring * vec3(0.35, 0.45, 0.45);
      // underwater: soft caustics, light shafts and slowly rising motes
      vec2 cq = q * 0.03;
      float caus = sin(cq.x * 3.1 + u_time * 0.6 + sin(cq.y * 2.3 + u_time * 0.5)) * sin(cq.y * 2.7 - u_time * 0.55 + sin(cq.x * 1.9));
      c += under * smoothstep(0.55, 0.95, caus) * vec3(0.025, 0.06, 0.06) * (1.0 - clamp(depth / 500.0, 0.0, 1.0));
      float shaft = pow(max(0.0, sin(q.x * 0.016 + q.y * 0.006 + 0.5 * sin(u_time * 0.25))), 10.0) * (1.0 - clamp(depth / 420.0, 0.0, 1.0));
      c += under * shaft * vec3(0.06, 0.11, 0.11);
      vec2 mq = q + vec2(sin(q.y * 0.02 + u_time * 0.4) * 4.0, u_time * 9.0);
      vec2 mc = floor(mq / 16.0);
      vec2 mp = mc * 16.0 + vec2(hash(mc + 1.7), hash(mc + 3.3)) * 14.0 + 1.0;
      float mote = step(abs(mq.x - mp.x), ${ART} * 0.5) * step(abs(mq.y - mp.y), ${ART} * 0.5) * step(0.72, hash(mc));
      c += under * mote * vec3(0.16, 0.22, 0.2);
      // foam on the crest
      float foam = 1.0 - step(2.0 * ${ART}, depth);
      foam *= 0.55 + 0.45 * step(0.4, hash(vec2(floor(q.x / 3.0), floor(u_time * 4.0))));
      c = mix(c, vec3(0.78, 0.84, 0.80), foam * (1.0 - under) * 0.8);
      float a = mix(0.84, 0.97, clamp(depth / 70.0, 0.0, 1.0));
      col = vec4(c * a, a);
    }
  }
  // ---- Rain ----
  if (u_rain > 0.0) {
    vec2 ph = (fc - u_harbor.xy) / u_harbor.z;
    vec2 qh = floor(ph / ${ART}) * ${ART};
    float r1 = rainLayer(qh, vec2(9.0, 40.0), 300.0, 0.16, 0.30, 9.0) * 0.32;
    float r2 = rainLayer(q + 37.0, vec2(14.0, 70.0), 470.0, 0.16, 0.26, 16.0) * 0.42;
    vec2 qs = floor(fc / 6.0) * 6.0;
    float r3 = rainLayer(qs, vec2(54.0, 300.0), 1300.0, 0.16, 0.22, 66.0) * 0.30 * u_out;
    float topY = (0.0 - u_pier.y) / u_pier.z;
    float drown = u_water < 9000.0 ? clamp((topY - u_water) / 60.0, 0.0, 1.0) : 0.0;
    float r = (r1 + r2 + r3) * u_rain * (1.0 - drown);
    vec3 rc = vec3(0.62, 0.72, 0.76) * (1.0 + u_flash * 1.5);
    col.rgb = col.rgb * (1.0 - r) + rc * r;
    col.a = col.a + r * (1.0 - col.a);
  }
  o = col;
}`;

// Composite: background layers + raindrop refraction on the window glass
const FS_COMP = /* glsl */`#version 300 es
precision highp float;
uniform sampler2D u_bg;
uniform vec2 u_res;
uniform float u_time;
uniform vec4 u_glass[5];
uniform float u_gs;        // scale of the glazed layer (screen pixels per logical pixel)
uniform float u_glassOn;
out vec4 o;
${GLSL_COMMON}
// returns the normal in xy and the mask in z
vec3 drops(vec2 q, float h) {
  vec3 r = vec3(0.0);
  // small resting droplets
  vec2 cell = floor(q / 6.0);
  vec2 f = q - cell * 6.0;
  float has = step(0.45, hash(cell));
  vec2 c = vec2(1.5 + 3.0 * hash(cell + 3.1), 1.5 + 3.0 * hash(cell + 7.7));
  float rad = 0.9 + 1.4 * hash(cell + 1.3);
  vec2 d = f - c;
  float m = step(length(d * vec2(1.0, 0.85)), rad) * has;
  r = vec3(d / rad, 1.0) * m;
  // large sliding drops and their trails
  float colW = 11.0;
  float col = floor(q.x / colW);
  float hc = hash(vec2(col, 11.0));
  if (hc > 0.35) {
    float speed = 7.0 + 26.0 * hash(vec2(col, 3.0));
    float span = h + 40.0 + 60.0 * hash(vec2(col, 5.0));
    float head = mod(u_time * speed + hc * 700.0, span) - 20.0;
    float cx = col * colW + 5.5 + sin(q.y * 0.16 + hc * 6.0) * 1.4;
    vec2 dd = vec2(q.x - cx, (q.y - head) * 0.75);
    float br = 2.3 + hc;
    float big = step(length(dd), br);
    if (big > 0.0) r = vec3(dd / br, 1.0);
    float trail = step(abs(q.x - cx), 0.8) * step(q.y, head) * step(head - 34.0, q.y);
    float bead = trail * step(0.55, hash(vec2(col, floor(q.y / 3.0))));
    if (trail > 0.0 && big == 0.0) r = vec3(0.0, 0.0, 0.0);
    if (bead > 0.0) r = vec3((q.x - cx) * 0.6, 0.0, 0.7);
  }
  return r;
}
void main() {
  vec2 fc = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);
  vec2 uv = gl_FragCoord.xy / u_res;
  vec3 dn = vec3(0.0);
  float inGlass = 0.0;
  for (int i = 0; i < 5; i++) {
    vec4 R = u_glass[i];
    if (fc.x >= R.x && fc.y >= R.y && fc.x < R.x + R.z && fc.y < R.y + R.w) {
      inGlass = 1.0;
      vec2 q = floor((fc - R.xy) / u_gs / ${ART}) * ${ART};
      dn = drops(q, R.w / u_gs);
    }
  }
  inGlass *= u_glassOn;
  vec2 off = dn.xy * dn.z * u_gs * 5.0 * inGlass;
  vec3 c = texture(u_bg, uv + vec2(off.x, -off.y) / u_res).rgb;
  if (inGlass > 0.0) {
    c = mix(c, c * vec3(0.86, 0.93, 0.97) + vec3(0.012, 0.02, 0.025), 0.6 * inGlass);
    float spec = dn.z * smoothstep(0.35, 1.0, dot(dn.xy, normalize(vec2(-0.6, -0.8))));
    c += spec * 0.22 * inGlass;
    c *= 1.0 - 0.18 * dn.z * length(dn.xy) * inGlass;
  }
  o = vec4(c, 1.0);
}`;

const FS_OVER = /* glsl */`#version 300 es
precision highp float;
uniform vec2 u_res;
uniform float u_fade;
uniform vec3 u_fadeColor;
uniform float u_vig;
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 d = (uv - 0.5) * vec2(u_res.x / u_res.y, 1.0);
  float v = smoothstep(0.45, 1.15, length(d)) * u_vig;
  float a = 1.0 - (1.0 - u_fade) * (1.0 - v);
  o = vec4(u_fadeColor * u_fade, a);
}`;

const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const clamp01 = v => Math.min(1, Math.max(0, v));
const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

export async function createPrologue(canvas, { reducedMotion = false, onThunder = () => {} } = {}) {
  const gl = getGL(canvas);
  if (!gl) return createFallback(canvas, reducedMotion);

  const imgs = await Promise.all(LAYERS.filter(l => l.f).map(l => loadImage(DIR + l.f + '.png').then(img => [l.n, img])));
  const tex = {};
  for (const [n, img] of imgs) {
    const L = LAYERS.find(l => l.n === n);
    tex[n] = { t: texture(gl, img, { wrap: L.tile ? gl.REPEAT : gl.CLAMP_TO_EDGE }), w: img.width, h: img.height };
  }
  const vao = quad(gl);
  const pLayer = program(gl, VS, FS_LAYER);
  const pFx = program(gl, VS, FS_FX);
  const pComp = program(gl, VS, FS_COMP);
  const pOver = program(gl, VS, FS_OVER);
  const bg = target(gl);

  const state = {
    P: 0, px: 0, py: 0, tpx: 0, tpy: 0, running: false, raf: 0, t0: performance.now(), last: 0,
    flashAt: 4 + Math.random() * 4, flash: 0, flicker: 1, flickerUntil: 0, W: 0, H: 0, dpr: 1,
  };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const cw = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const ch = Math.max(1, Math.round(canvas.clientHeight * dpr));
    const k = Math.min(1, 2560 / cw);
    const W = Math.round(cw * k), H = Math.round(ch * k);
    if (W !== state.W || H !== state.H) {
      canvas.width = W; canvas.height = H; state.W = W; state.H = H;
      bg.size(W, H);
    }
  }

  // Camera: the screen transform of every layer
  function camera(time) {
    const { W, H, P } = state;
    const portrait = H > W;
    const B = Math.max(W / SW, H / SH) * 1.035;
    const tD = reducedMotion ? 0 : ease(smooth(0.05, 0.33, P));   // dolly
    const cross = smooth(0.24, 0.34, P);                           // indoor layers fade out
    const s = smooth(0.34, 0.97, P);                               // outdoor stretch
    const c0 = [portrait ? 470 : 480, 270];
    const D = DOOR, E = [portrait ? 470 : 575, 196];
    let cx = lerp(c0[0], D[0], ease(smooth(0.03, 0.30, P)));
    let cy = lerp(c0[1], D[1], ease(smooth(0.03, 0.30, P)));
    cx = lerp(cx, E[0], ease(s)); cy = lerp(cy, E[1], ease(s));
    if (!reducedMotion) { cx += Math.sin(time * 0.13) * 3; cy += Math.sin(time * 0.17) * 1.5; }
    // keep the edges of the sky layer (-2..962, -2..542) out of view, with room for pointer parallax
    const Ss = B / (1 - tD * 0.22), hw = W / 2 / Ss + 2, hh = H / 2 / Ss + 2;
    cx = Math.min(962 - hw, Math.max(-2 + hw, cx));
    cy = Math.min(542 - hh, Math.max(-2 + hh, cy));
    return { W, H, B, tD, cross, s, cx, cy };
  }
  function xf(L, cam) {
    const S = cam.B / (1 - cam.tD * L.a);
    const ox = cam.W / 2 + (-state.px * L.par - cam.cx) * S;
    const oy = cam.H / 2 + (-state.py * L.par * 0.5 - cam.cy) * S;
    return { S, ox, oy };
  }

  function drawLayer(L, cam, time, alpha) {
    const T = tex[L.n];
    const { S, ox, oy } = xf(L, cam);
    let x = L.x, y = L.y, w = L.w, h = L.h;
    let u0 = 0, v0 = 0, u1 = 1, v1 = 1;
    if (L.frames) {
      const fi = L.frame ?? Math.floor(time * (L.fps || 2)) % L.frames;
      const fw = 1 / L.frames, hx = 0.5 / T.w;
      u0 = fi * fw + hx; u1 = (fi + 1) * fw - hx;
    }
    if (L.tile) {
      x = -160; w = SW + 320;
      const off = (time * L.drift) / L.w;
      u0 = -160 / L.w + off; u1 = u0 + w / L.w;
    }
    if (L.bob && !reducedMotion) y += Math.sin(time * 1.15) * 0.75 * L.bob;
    const rect = [ox + x * S, oy + y * S, w * S, h * S];
    let rot = [0, 0, 0];
    if (L.sway) {
      const ang = reducedMotion ? 0 : Math.sin(time * 0.85) * 0.03 + Math.sin(time * 2.3) * 0.004;
      rot = [ox + LAMP_PIVOT[0] * S, oy + LAMP_PIVOT[1] * S, ang];
    }
    const { u } = pLayer;
    gl.uniform4f(u.u_rect, ...rect);
    gl.uniform3f(u.u_rot, ...rot);
    gl.uniform4f(u.u_uv, u0, v0, u1, v1);
    gl.uniform2f(u.u_size, L.tile ? T.w : (L.frames ? T.w : T.w), T.h);
    let a = alpha;
    if (L.flicker) a *= state.flicker;
    gl.uniform1f(u.u_alpha, a);
    const f = state.flash;
    if (L.g === 'bg') gl.uniform4f(u.u_flash, 0.55, 0.62, 0.78, f * (L.n === 'sky' ? 1.3 : 0.55));
    else gl.uniform4f(u.u_flash, 0.42, 0.5, 0.65, f * 0.14);
    gl.uniform3f(u.u_wave, L.wave && !reducedMotion ? 0.65 / L.w : 0, (HORIZON - L.y) / L.h, time);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, T.t);
    if (L.add) gl.blendFunc(gl.ONE, gl.ONE); else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function full(prog) {
    gl.useProgram(prog.p);
    gl.uniform2f(prog.u.u_res, state.W, state.H);
    gl.uniform4f(prog.u.u_rect, 0, 0, state.W, state.H);
    gl.uniform3f(prog.u.u_rot, 0, 0, 0);
    gl.uniform4f(prog.u.u_uv, 0, 0, 1, 1);
  }

  function updateFlash(time, dt) {
    if (reducedMotion) { state.flash = 0; return; }
    if (time > state.flashAt) {
      const k = time - state.flashAt;
      // two flashes: one at 0-0.25 s, another at 0.32-0.8 s
      const f1 = k < 0.25 ? Math.exp(-k * 14) * Math.min(1, k * 40) : 0;
      const k2 = k - 0.32;
      const f2 = k2 > 0 && k2 < 0.9 ? 0.75 * Math.exp(-k2 * 6) * Math.min(1, k2 * 30) : 0;
      state.flash = Math.max(f1, f2);
      if (!state.thundered && k > 0.1) { state.thundered = true; onThunder(); }
      if (k > 1.3) { state.flashAt = time + 9 + Math.random() * 10; state.thundered = false; }
    } else state.flash = 0;
    // the bulb flickers now and then
    if (time > state.flickerUntil) {
      state.flicker = 1;
      if (Math.random() < dt * 0.25) state.flickerUntil = time + 0.12 + Math.random() * 0.25;
    } else state.flicker = 0.55 + Math.random() * 0.35;
  }

  function frame(now) {
    state.raf = 0;
    if (!state.running) return;
    const time = (now - state.t0) / 1000;
    const dt = Math.min(0.05, time - state.last || 0.016);
    state.last = time;
    state.px += (state.tpx - state.px) * Math.min(1, dt * 3);
    state.py += (state.tpy - state.py) * Math.min(1, dt * 3);
    resize();
    updateFlash(time, dt);
    const cam = camera(time);
    const P = state.P;
    const roomA = 1 - cam.cross;
    const outside = cam.cross;
    // water level (pier layer y): rises from the front of the pier at 0.42, covers the picture by 0.92
    const ws = smooth(0.4, 0.93, P);
    const water = P < 0.4 ? 9999 : lerp(430, -260, ws * ws * (3 - 2 * ws) * 0.5 + ws * 0.5);
    const fade = smooth(0.925, 0.995, P);

    // 1) background layers -> FBO
    gl.bindFramebuffer(gl.FRAMEBUFFER, bg.fbo);
    gl.viewport(0, 0, state.W, state.H);
    gl.clearColor(0.02, 0.03, 0.035, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.bindVertexArray(vao);
    const harborXf = xf(LAYERS[1], cam), pierXf = xf(LAYERS.find(l => l.n === 'pier'), cam);
    for (const L of LAYERS) {
      if (L.fx) {
        full(pFx);
        const u = pFx.u;
        gl.uniform1f(u.u_time, time);
        gl.uniform1i(u.u_mode, L.fx === 'lights' ? 0 : 1);
        gl.uniform3f(u.u_harbor, harborXf.ox, harborXf.oy, harborXf.S);
        gl.uniform3f(u.u_pier, pierXf.ox, pierXf.oy, pierXf.S);
        gl.uniform3fv(u.u_lights, FAR_LIGHTS.flat());
        gl.uniform1f(u.u_water, water);
        gl.uniform1f(u.u_rain, reducedMotion ? 0.5 : 1);
        gl.uniform1f(u.u_out, outside);
        gl.uniform1f(u.u_flash, state.flash);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        continue;
      }
      if (L.g !== 'bg') continue;
      gl.useProgram(pLayer.p);
      gl.uniform2f(pLayer.u.u_res, state.W, state.H);
      drawLayer(L, cam, time, 1);
    }

    // 2) composite to the screen (raindrops on the glass)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, state.W, state.H);
    gl.disable(gl.BLEND);
    full(pComp);
    const roomXf = xf(LAYERS.find(l => l.n === 'room'), cam);
    const rects = [];
    for (const [x, y, w, h] of GLASS) rects.push(roomXf.ox + x * roomXf.S, roomXf.oy + y * roomXf.S, w * roomXf.S, h * roomXf.S);
    gl.uniform4fv(pComp.u.u_glass, rects);
    gl.uniform1f(pComp.u.u_gs, roomXf.S);
    gl.uniform1f(pComp.u.u_time, reducedMotion ? 0 : time);
    gl.uniform1f(pComp.u.u_glassOn, roomA);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, bg.tex);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // 3) indoor layers
    gl.enable(gl.BLEND);
    if (roomA > 0.001) {
      gl.useProgram(pLayer.p);
      gl.uniform2f(pLayer.u.u_res, state.W, state.H);
      for (const L of LAYERS) if (L.g === 'fg') drawLayer(L, cam, time, roomA);
    }

    // 4) vignette and the closing fade
    full(pOver);
    gl.uniform1f(pOver.u.u_fade, fade);
    gl.uniform3f(pOver.u.u_fadeColor, 13 / 255, 23 / 255, 25 / 255);
    gl.uniform1f(pOver.u.u_vig, 0.55 + 0.25 * outside);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    state.water = water;
    if (state.running && !reducedMotion) state.raf = requestAnimationFrame(frame);
  }

  const api = {
    gl: true,
    setProgress(P) { state.P = P; if (reducedMotion && state.running && !state.raf) state.raf = requestAnimationFrame(frame); },
    setPointer(x, y) { state.tpx = x; state.tpy = y; },
    start() { if (state.running) return; state.running = true; state.raf = requestAnimationFrame(frame); },
    stop() { state.running = false; if (state.raf) cancelAnimationFrame(state.raf); state.raf = 0; },
    resize() { if (reducedMotion && state.running && !state.raf) state.raf = requestAnimationFrame(frame); },
    /** Current water level in metres (only for the on-screen readout) */
    tideMeters() { const w = state.water ?? 9999; return w > 9000 ? 0 : Math.max(0, (430 - w) / 60); },
  };
  return api;
}

// No WebGL2: draw the layers statically in 2D and fade the room out while scrolling.
async function createFallback(canvas, reducedMotion) {
  const ctx = canvas.getContext('2d');
  const imgs = {};
  await Promise.all(LAYERS.filter(l => l.f).map(async l => { imgs[l.n] = await loadImage(DIR + l.f + '.png'); }));
  const st = { P: 0 };
  function draw() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const W = Math.round(canvas.clientWidth * dpr), H = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    const B = Math.max(W / SW, H / SH);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#05080a'; ctx.fillRect(0, 0, W, H);
    const roomA = 1 - smooth(0.12, 0.34, st.P);
    const ox = W / 2 - 480 * B, oy = H / 2 - 270 * B;
    for (const L of LAYERS) {
      if (!L.f || L.add) continue;
      const img = imgs[L.n];
      ctx.globalAlpha = L.g === 'fg' ? roomA : 1;
      if (ctx.globalAlpha <= 0) continue;
      if (L.tile) { for (let x = 0; x < SW; x += L.w) ctx.drawImage(img, ox + x * B, oy + L.y * B, L.w * B, L.h * B); continue; }
      const fw = L.frames ? img.width / L.frames : img.width;
      const fi = L.frames ? (L.frame ?? 0) : 0;
      ctx.drawImage(img, fi * fw, 0, fw, img.height, ox + L.x * B, oy + L.y * B, L.w * B, L.h * B);
    }
    ctx.globalAlpha = smooth(0.6, 0.99, st.P);
    ctx.fillStyle = '#0d1719'; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
  return {
    gl: false,
    setProgress(P) { st.P = P; draw(); },
    setPointer() {}, start() { draw(); }, stop() {}, resize() { draw(); },
    tideMeters() { return Math.max(0, smooth(0.4, 0.93, st.P) * 11); },
  };
}
