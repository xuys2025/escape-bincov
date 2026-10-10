import { canvas, dot, outline, rect, shade, type Ctx } from '../paint';

/** Procedural placeholders for the station's people, on the same 32x48 frame and foot anchor (16,47) as Sol's player. */
export interface Look {
  skin: string; hair: string; hairStyle: 'short' | 'bun' | 'cap' | 'hood' | 'knit' | 'kitchen' | 'bald';
  top: string; pants: string; shoes: string; build: 'slim' | 'mid' | 'wide';
  apron?: string; sleeves?: string; pens?: boolean; headphones?: boolean; glasses?: boolean; beard?: string; scarf?: string;
  carry?: 'bucket' | 'crate' | 'notebook' | 'rag' | 'lantern' | null;
}
export const LOOKS: Record<string, Look> = {
  xu: { skin: '#c9a184', hair: '#4a4540', hairStyle: 'bun', top: '#8ea2a8', pants: '#3e4548', shoes: '#2a2826', build: 'slim', pens: true, sleeves: '#7c8f95', glasses: true, carry: 'notebook' },
  shuan: { skin: '#b08466', hair: '#8a8780', hairStyle: 'cap', top: '#5d6650', pants: '#3a3a33', shoes: '#2a2622', build: 'wide', apron: '#5a4632', beard: '#8f8a80', carry: 'rag' },
  cai: { skin: '#cfa889', hair: '#1f1d1b', hairStyle: 'short', top: '#4f5a66', pants: '#2f3438', shoes: '#3a3530', build: 'slim', sleeves: '#2d3c5a', headphones: true },
  cook: { skin: '#c79a7c', hair: '#2b2725', hairStyle: 'kitchen', top: '#9a4a3c', pants: '#3a3836', shoes: '#2a2826', build: 'mid', apron: '#d8d4c8' },
  'resident-a': { skin: '#b88d70', hair: '#2a2725', hairStyle: 'knit', top: '#3d5d74', pants: '#3a3a36', shoes: '#2f3a2c', build: 'mid', carry: 'bucket' },
  'resident-b': { skin: '#c49a7a', hair: '#1f1d1b', hairStyle: 'short', top: '#6b5a3a', pants: '#3a3836', shoes: '#2a2826', build: 'mid', carry: 'crate' },
  'resident-c': { skin: '#c9a184', hair: '#2b2725', hairStyle: 'bun', top: '#7a4a52', pants: '#3a3a42', shoes: '#2a2826', build: 'slim' },
  'resident-d': { skin: '#a87e62', hair: '#55504a', hairStyle: 'bald', top: '#4a5a44', pants: '#36342f', shoes: '#2a2826', build: 'wide' },
  'resident-e': { skin: '#b88d70', hair: '#2a2725', hairStyle: 'hood', top: '#a88a2a', pants: '#3a3a36', shoes: '#2f3a2c', build: 'mid' },
  'resident-f': { skin: '#c49a7a', hair: '#3a3532', hairStyle: 'knit', top: '#5a4a5c', pants: '#2f2f33', shoes: '#2a2826', build: 'slim', scarf: '#a8382c' },
  boatman: { skin: '#a07656', hair: '#9a968e', hairStyle: 'knit', top: '#a8943a', pants: '#2f3a3a', shoes: '#1f2a2a', build: 'mid', beard: '#a8a49a' },
  trader: { skin: '#9a7a62', hair: '#1f1d1b', hairStyle: 'hood', top: '#26302f', pants: '#1f2424', shoes: '#151818', build: 'mid', scarf: '#3a4a48', carry: 'lantern' },
};

export type Dir = 's' | 'n' | 'e' | 'w';
export type Pose = 'idle' | 'walk' | 'sit' | 'warm' | 'smoke' | 'work' | 'talk';
export const POSE_FRAMES: Record<Pose, number> = { idle: 2, walk: 4, sit: 2, warm: 2, smoke: 2, work: 2, talk: 2 };

export function paintPerson(lookId: string, dir: Dir, pose: Pose, frame: number): HTMLCanvasElement {
  const L = LOOKS[lookId] ?? LOOKS['resident-a'];
  const { c, g } = canvas(32, 48);
  const side = dir === 'e' || dir === 'w', back = dir === 'n';
  const walk = pose === 'walk', sit = pose === 'sit';
  const bob = walk ? (frame % 2) : pose === 'idle' ? frame : 0;
  const bw = L.build === 'wide' ? 14 : L.build === 'slim' ? 11 : 12;
  const tw = side ? Math.max(8, bw - 4) : bw;
  const cx = 16, top = 9 + (sit ? 7 : 0) + bob, shoulder = top + 11, hip = shoulder + 12;
  const tx = cx - Math.floor(tw / 2);

  // Legs and shoes.
  if (sit) {
    rect(g, L.pants, tx + 1, hip, tw - 2, 4);
    if (!side) { rect(g, L.pants, tx + 1, hip + 3, 4, 8); rect(g, L.pants, tx + tw - 5, hip + 3, 4, 8); rect(g, L.shoes, tx + 1, hip + 10, 4, 2); rect(g, L.shoes, tx + tw - 5, hip + 10, 4, 2); }
    else { rect(g, L.pants, cx - 2, hip + 1, 8, 4); rect(g, L.pants, cx + 4, hip + 4, 3, 7); rect(g, L.shoes, cx + 4, hip + 10, 5, 2); }
  } else {
    const legTop = hip, legLen = 46 - legTop - 2;
    if (side) {
      const stride = walk ? [-3, 0, 3, 0][frame % 4] : 0;
      rect(g, shade(L.pants, -.2), cx - 2 - stride, legTop, 4, legLen); rect(g, shade(L.shoes, -.1), cx - 3 - stride, 44, 5, 2);
      rect(g, L.pants, cx - 2 + stride, legTop, 4, legLen); rect(g, L.shoes, cx - 2 + stride, 44, 6, 2);
    } else {
      const lift = walk ? [0, 2, 0, -2][frame % 4] : 0;
      const lx = tx + 1, rx = tx + tw - 5;
      rect(g, L.pants, lx, legTop, 4, legLen - Math.max(0, lift)); rect(g, L.shoes, lx, 44 - Math.max(0, lift), 4, 2);
      rect(g, L.pants, rx, legTop, 4, legLen - Math.max(0, -lift)); rect(g, L.shoes, rx, 44 - Math.max(0, -lift), 4, 2);
      rect(g, shade(L.pants, -.25), cx - 1, legTop, 2, 3);
    }
  }
  // Torso, apron, details.
  rect(g, L.top, tx, shoulder, tw, hip - shoulder + 1);
  rect(g, shade(L.top, .14), tx, shoulder, tw, 1);
  rect(g, shade(L.top, -.2), tx, hip - 2, tw, 2);
  if (L.apron && !back) { rect(g, L.apron, tx + 2, shoulder + 3, tw - 4, hip - shoulder + (sit ? 2 : 6)); rect(g, shade(L.apron, .15), tx + 2, shoulder + 3, tw - 4, 1); if (lookId === 'shuan') { dot(g, '#2a2420', tx + 4, shoulder + 7); dot(g, '#2a2420', tx + 7, shoulder + 10); dot(g, '#2a2420', tx + 5, shoulder + 13); } }
  if (L.apron && back) { rect(g, shade(L.apron, -.1), cx - 1, shoulder + 2, 2, 8); }
  if (L.pens && !back && !side) { rect(g, '#d8dcd8', tx + tw - 5, shoulder + 3, 3, 3); dot(g, '#2a2826', tx + tw - 5, shoulder + 2); dot(g, '#a8382c', tx + tw - 4, shoulder + 2); dot(g, '#2d4f8a', tx + tw - 3, shoulder + 2); }
  if (L.scarf) { rect(g, L.scarf, tx + 1, shoulder - 1, tw - 2, 3); if (!back) rect(g, L.scarf, tx + 3, shoulder + 2, 2, 4); }
  if (!back && !side && !L.apron && L.build !== 'wide') rect(g, shade(L.top, -.3), cx, shoulder + 2, 1, hip - shoulder - 3);
  // Arms.
  const sleeve = L.sleeves ?? shade(L.top, -.08), armLen = 11;
  const swing = walk ? [1, 0, -1, 0][frame % 4] : 0;
  const armPose = (which: -1 | 1): [number, number, number] => {
    // returns [x, yTop, length] in canvas coords
    const ax = which < 0 ? tx - 2 : tx + tw - 1;
    if (pose === 'warm' && !back) return [which < 0 ? tx : tx + tw - 3, shoulder + 3 - (frame ? 1 : 0), 7];
    if (pose === 'smoke' && which > 0 && frame === 1) return [ax - 1, shoulder - 2, 6];
    if (pose === 'work') return [ax + (which < 0 ? 1 : -1), shoulder + 1 - (frame === which + 1 ? 2 : 0), armLen - 3];
    if (pose === 'talk' && which > 0 && frame === 1) return [ax + 1, shoulder - 1, armLen - 2];
    return [ax, shoulder + 1 + (which < 0 ? swing : -swing), armLen];
  };
  const arms: (-1 | 1)[] = side ? [dir === 'e' ? 1 : -1] : [-1, 1];
  for (const a of arms) {
    const [ax, ay, len] = armPose(a);
    rect(g, sleeve, ax, ay, 3, len); rect(g, shade(sleeve, .12), ax, ay, 1, len);
    if (!back || pose === 'work') rect(g, L.skin, ax, ay + len, 3, 2);
  }
  // Carried things.
  if (L.carry === 'bucket' && !sit) { const hx = side ? (dir === 'e' ? cx + 4 : cx - 9) : tx + tw; rect(g, '#7a8a8e', hx, hip, 6, 6); rect(g, '#9aaeb2', hx, hip, 6, 1); rect(g, '#3a5a6a', hx + 1, hip + 1, 4, 1); }
  if (L.carry === 'crate' && walk) { rect(g, '#2f6a8c', tx - 1, shoulder + 5, tw + 2, 6); rect(g, '#3d7fa0', tx - 1, shoulder + 5, tw + 2, 1); }
  if (L.carry === 'notebook' && !back && !side) { rect(g, '#d8d0b0', tx - 3, shoulder + 7, 4, 6); }
  if (L.carry === 'rag' && !back && pose !== 'work') { rect(g, '#b8a888', tx + tw, shoulder + 9, 3, 4); }
  if (L.carry === 'lantern') { const lx = side ? (dir === 'e' ? cx + 5 : cx - 8) : tx + tw; rect(g, '#2a2826', lx, hip - 2, 4, 1); rect(g, '#ffd27a', lx, hip - 1, 4, 4); rect(g, '#3a3632', lx, hip + 3, 4, 1); }
  // Neck and head.
  rect(g, shade(L.skin, -.15), cx - 2, shoulder - 2, 4, 2);
  const hx = cx - 4, hy = top, hw = 9, hh = 9;
  rect(g, L.skin, hx, hy, hw, hh);
  rect(g, shade(L.skin, -.18), hx, hy + hh - 1, hw, 1);
  paintHair(g, L, dir, hx, hy, hw, hh);
  if (!back) {
    if (side) {
      const fx = dir === 'e' ? hx + hw - 2 : hx + 1;
      dot(g, '#1d1a18', fx, hy + 4); dot(g, shade(L.skin, -.25), dir === 'e' ? hx + hw : hx - 1, hy + 5);
      if (L.beard) rect(g, L.beard, dir === 'e' ? hx + 4 : hx, hy + 7, 5, 2);
    } else {
      dot(g, '#1d1a18', hx + 2, hy + 4); dot(g, '#1d1a18', hx + 6, hy + 4);
      if (L.glasses) { rect(g, '#6a6e6c', hx + 1, hy + 3, 3, 1); rect(g, '#6a6e6c', hx + 5, hy + 3, 3, 1); dot(g, '#6a6e6c', hx + 4, hy + 4); }
      if (L.beard) { rect(g, L.beard, hx + 1, hy + 6, hw - 2, 2); dot(g, L.beard, hx + 1, hy + 5); dot(g, L.beard, hx + hw - 2, hy + 5); }
      else dot(g, shade(L.skin, -.3), hx + 4, hy + 7);
    }
  }
  if (L.headphones) { rect(g, '#2a2826', hx - 1, hy + 3, 2, 4); rect(g, '#2a2826', hx + hw - 1, hy + 3, 2, 4); rect(g, '#3a3734', hx, hy - 1, hw, 1); }
  if (pose === 'smoke' && frame === 1 && !back) { dot(g, '#ff8a3a', side ? (dir === 'e' ? hx + hw + 1 : hx - 2) : hx + 6, hy + 7); }
  if (pose === 'smoke' && frame === 0) dot(g, '#ff6a2a', tx + tw + 1, shoulder + armLen + 1);
  const out = outline(c, '#15130f');
  if (dir === 'w') { const m = canvas(32, 48); m.g.translate(32, 0); m.g.scale(-1, 1); m.g.drawImage(out, 0, 0); return m.c; }
  return out;
}

function paintHair(g: Ctx, L: Look, dir: Dir, x: number, y: number, w: number, h: number) {
  const back = dir === 'n', side = dir === 'e' || dir === 'w';
  switch (L.hairStyle) {
    case 'short': rect(g, L.hair, x, y - 1, w, 3); rect(g, L.hair, x, y, 1, back ? h - 1 : 4); rect(g, L.hair, x + w - 1, y, 1, back ? h - 1 : 4); if (back) rect(g, L.hair, x, y, w, h - 2); if (side) rect(g, L.hair, dir === 'e' ? x : x + w - 3, y, 3, 6); break;
    case 'bun': rect(g, L.hair, x, y - 1, w, 3); rect(g, L.hair, x, y, 1, 5); rect(g, L.hair, x + w - 1, y, 1, 5); if (back) { rect(g, L.hair, x, y, w, h - 1); rect(g, shade(L.hair, .15), x + 3, y + 5, 3, 3); } if (side) rect(g, L.hair, dir === 'e' ? x - 2 : x + w, y + 3, 3, 3); dot(g, shade(L.hair, .3), x + 2, y - 1); break;
    case 'cap': {
      const cap = '#2f3a52';
      rect(g, cap, x - 1, y - 2, w + 2, 4); rect(g, shade(cap, .15), x - 1, y - 2, w + 2, 1);
      if (!back) { if (side) rect(g, shade(cap, -.2), dir === 'e' ? x + w - 1 : x - 3, y + 1, 4, 2); else rect(g, shade(cap, -.25), x - 1, y + 2, w + 2, 1); }
      rect(g, L.hair, x, y + 2, 1, 3); rect(g, L.hair, x + w - 1, y + 2, 1, 3); if (back) rect(g, L.hair, x, y + 2, w, h - 4);
      break;
    }
    case 'knit': { const k = L.scarf ? '#6a3a3a' : '#3a4a5a'; rect(g, k, x - 1, y - 2, w + 2, 5); rect(g, shade(k, .15), x - 1, y - 2, w + 2, 1); rect(g, shade(k, -.2), x - 1, y + 2, w + 2, 1); dot(g, shade(k, .25), x + 4, y - 3); if (back) rect(g, L.hair, x, y + 3, w, h - 5); break; }
    case 'hood': { const hc = shade(L.top, -.08); rect(g, hc, x - 1, y - 2, w + 2, h + 1); if (!back) { if (side) g.clearRect(dir === 'e' ? x + 4 : x, y + 2, 5, 6); else g.clearRect(x + 1, y + 2, w - 2, 6); rect(g, L.skin, side ? (dir === 'e' ? x + 4 : x) : x + 1, y + 2, side ? 5 : w - 2, 6); } rect(g, shade(hc, .15), x - 1, y - 2, w + 2, 1); break; }
    case 'kitchen': rect(g, '#e6e2d6', x - 1, y - 3, w + 2, 4); rect(g, '#cfcabb', x - 1, y, w + 2, 1); rect(g, L.hair, x, y + 1, 1, 3); rect(g, L.hair, x + w - 1, y + 1, 1, 3); if (back) rect(g, L.hair, x, y + 1, w, h - 3); break;
    case 'bald': rect(g, shade(L.skin, .08), x + 1, y - 1, w - 2, 1); rect(g, L.hair, x, y + 2, 1, 4); rect(g, L.hair, x + w - 1, y + 2, 1, 4); if (back) rect(g, L.hair, x, y + 4, w, 3); break;
  }
}
