import type { ActorKind } from '../../raid-runtime/contract';
import { P, canvas, disc, dot, line, outline, rect, type Ctx } from './paint';

export const ACTOR_W = 32, ACTOR_H = 48;
export const WALK_FRAMES = 4;

interface Look { coat: string; coatL: string; coatD: string; pants: string; boots: string; pack: string; packL: string; head: string; headL: string; face: string; accent: string; mask?: string; crust?: boolean; helmet?: boolean }
const LOOKS: Record<Exclude<ActorKind, 'creature'>, Look> = {
  player: { coat: '#5d6148', coatL: '#727759', coatD: '#454836', pants: '#3e3b33', boots: '#2b2925', pack: '#75634e', packL: '#8d7859', head: '#3d3b35', headL: '#4f4c44', face: P.skin, accent: '#c9a65e' },
  scav: { coat: '#6b5443', coatL: '#80664f', coatD: '#4f3d31', pants: '#4a463d', boots: '#2e2a25', pack: '#5a4c3d', packL: '#6d5c49', head: '#594a3b', headL: '#6b5a48', face: P.skin, accent: '#9a4636', mask: '#8c4a3a' },
  salt: { coat: '#8b8676', coatL: '#a39d8b', coatD: '#6b675b', pants: '#5b5a52', boots: '#33312c', pack: '#6b675b', packL: '#7f7a6b', head: '#77736a', headL: '#8b8679', face: '#9c8a78', accent: '#9a4636', mask: '#394b50', crust: true },
  elite: { coat: '#43423d', coatL: '#5d5b54', coatD: '#302f2b', pants: '#33322e', boots: '#24231f', pack: '#4f4d47', packL: '#64625a', head: '#4f4e48', headL: '#666560', face: P.skin, accent: '#a3483a', mask: '#2e3a3c', helmet: true },
};

function paintBody(g: Ctx, L: Look, dir: 0 | 1 | 2 | 6 | 7, walk: number) {
  const top = 9 + (walk === 1 || walk === 3 ? 1 : 0);
  const side = dir === 0, front = dir === 1 || dir === 2, back = dir === 6 || dir === 7;
  const tw = side ? 9 : dir === 2 || dir === 6 ? 13 : 12;
  const cx = 16, tx = cx - Math.floor(tw / 2) + (dir === 1 ? 1 : dir === 7 ? -1 : 0);
  const hipY = 34, footY = 47;
  const phase = [0, 1, 0, -1, 0][walk];
  if (side) {
    const stride = phase * 4;
    const leg = (dx: number, color: string, lift: number) => { rect(g, color, cx - 2 + dx, hipY, 4, footY - hipY - lift); rect(g, L.boots, cx - 2 + dx, footY - 3 - lift, 5, 3); };
    leg(-stride, '#35322b', stride ? 1 : 0); leg(stride, L.pants, 0);
  } else {
    const lx = cx - 5, rx = cx + 1, lift = phase === 0 ? 0 : 2;
    const ll = phase > 0 ? lift : 0, rl = phase < 0 ? lift : 0;
    rect(g, L.pants, lx, hipY, 4, footY - hipY - ll); rect(g, L.boots, lx, footY - 3 - ll, 4, 3);
    rect(g, back ? '#35322b' : L.pants, rx, hipY, 4, footY - hipY - rl); rect(g, L.boots, rx, footY - 3 - rl, 4, 3);
    rect(g, '#2f2c26', lx + 3, hipY, 1, footY - hipY - 3 - ll);
  }
  const tTop = top + 11;
  if (back) { rect(g, L.pack, tx + 1 + (dir === 7 ? -2 : 0), tTop + 1, tw - 2, 13); rect(g, L.packL, tx + 1 + (dir === 7 ? -2 : 0), tTop + 1, tw - 2, 2); rect(g, '#4a3f33', tx + 2 + (dir === 7 ? -2 : 0), tTop + 9, tw - 4, 1); }
  if (side) { rect(g, L.pack, tx - 4, tTop + 1, 5, 13); rect(g, L.packL, tx - 4, tTop + 1, 5, 2); }
  rect(g, L.coat, tx, tTop, tw, hipY - tTop + 1);
  rect(g, L.coatL, tx, tTop, tw, 2); rect(g, L.coatL, tx, tTop, 2, hipY - tTop - 2);
  rect(g, L.coatD, tx + tw - 2, tTop + 2, 2, hipY - tTop - 1);
  rect(g, '#2f2c26', tx, hipY - 1, tw, 2);
  if (back) {
    rect(g, L.pack, tx + 1 + (dir === 7 ? -2 : 0), tTop + 1, tw - 2, 12); rect(g, L.packL, tx + 1 + (dir === 7 ? -2 : 0), tTop + 1, tw - 2, 2); rect(g, '#4a3f33', tx + 2 + (dir === 7 ? -2 : 0), tTop + 8, tw - 4, 1);
  } else if (front) {
    rect(g, '#4a3f33', tx + 2, tTop, 1, 9); rect(g, '#4a3f33', tx + tw - 3, tTop, 1, 9);
    rect(g, L.coatD, cx - 1 + (dir === 1 ? 1 : 0), tTop + 3, 1, hipY - tTop - 4);
  }
  if (L.crust) for (const [x, y] of [[1, 3], [4, 8], [tw - 3, 5], [2, 13], [tw - 4, 12]]) dot(g, '#d2cbb6', tx + x, tTop + y);
  if (!back || dir === 7) rect(g, L.accent, side ? tx + 1 : tx - 1, tTop + 4, side ? 3 : 2, 3);
  rect(g, L.coat, tx - 1, tTop + 1, 1, 6); rect(g, L.coatD, tx + tw, tTop + 1, 1, 6);
  const hx = cx - 4 + (dir === 1 ? 1 : dir === 0 ? 1 : dir === 7 ? 0 : 0), hy = top;
  rect(g, L.head, hx, hy, 9, 10);
  rect(g, L.headL, hx, hy, 9, 2); rect(g, L.headL, hx, hy, 2, 6);
  if (front) {
    const fx = hx + (dir === 1 ? 2 : 1);
    rect(g, L.face, fx, hy + 4, 7, 6); rect(g, P.skinDark, fx, hy + 9, 7, 1);
    dot(g, P.ink, fx + (dir === 1 ? 3 : 1), hy + 6); dot(g, P.ink, fx + (dir === 1 ? 5 : 5), hy + 6);
    if (L.mask) rect(g, L.mask, fx, hy + 7, 7, 3);
  } else if (side) {
    rect(g, L.face, hx + 5, hy + 4, 4, 6); dot(g, P.ink, hx + 7, hy + 6); rect(g, P.skinDark, hx + 4, hy + 5, 1, 2);
    if (L.mask) rect(g, L.mask, hx + 5, hy + 7, 4, 3);
  } else if (dir === 7) { rect(g, L.face, hx + 7, hy + 5, 2, 4); }
  if (L.helmet) { rect(g, '#5d5b54', hx - 1, hy - 1, 11, 5); rect(g, '#77746b', hx - 1, hy - 1, 11, 1); if (front || side) rect(g, L.mask!, hx + (side ? 4 : 1), hy + 4, side ? 5 : 7, 2); }
  rect(g, L.head, hx, hy + 10, 9, 1);
}

function paintCreature(g: Ctx, dir: number, walk: number) {
  const sway = [0, 1, 0, -1, 0][walk], flip = dir >= 3 && dir <= 5;
  g.save(); if (flip) { g.translate(32, 0); g.scale(-1, 1); }
  disc(g, '#4a3836', 16, 33, 12, 9);
  disc(g, '#5f4541', 15 + sway, 30, 10, 8); disc(g, '#6f4c45', 13 + sway, 28, 6, 5);
  rect(g, '#3a2c2a', 7, 38, 4, 9 - Math.max(0, sway)); rect(g, '#3a2c2a', 20, 38, 4, 9 - Math.max(0, -sway));
  rect(g, '#4a3836', 4, 30, 4, 12); rect(g, '#4a3836', 25, 31, 4, 11);
  rect(g, '#b8ae98', 3, 41, 3, 2); rect(g, '#b8ae98', 26, 41, 3, 2);
  disc(g, '#5f4541', 21 + sway, 21, 5, 5); dot(g, '#c8574a', 23 + sway, 21); dot(g, '#c8574a', 20 + sway, 21);
  for (const [x, y] of [[9, 26], [12, 32], [18, 27], [21, 34], [14, 23]]) { dot(g, '#b8ae98', x + sway, y); dot(g, '#d2cbb6', x + sway, y - 1); }
  for (const [x, y] of [[11, 29], [19, 31], [16, 36]]) dot(g, '#a8463a', x, y);
  if (dir === 6 || dir === 5 || dir === 7) { rect(g, '#5f4541', 17 + sway, 17, 8, 6); }
  g.restore();
}

export function paintActorFrame(kind: ActorKind, dir: number, walk: number): HTMLCanvasElement {
  const { c, g } = canvas(ACTOR_W, ACTOR_H);
  if (kind === 'creature') { paintCreature(g, dir, walk); outline(c); return c; }
  const L = LOOKS[kind];
  const mirror = dir >= 3 && dir <= 5;
  const base = (mirror ? ({ 3: 1, 4: 0, 5: 7 } as Record<number, number>)[dir] : dir) as 0 | 1 | 2 | 6 | 7;
  if (mirror) { g.save(); g.translate(32, 0); g.scale(-1, 1); }
  paintBody(g, L, base, walk);
  if (mirror) g.restore();
  outline(c);
  return c;
}

export function paintCorpse(kind: ActorKind, facing: 1 | -1): HTMLCanvasElement {
  const { c, g } = canvas(40, 24);
  g.save(); if (facing < 0) { g.translate(40, 0); g.scale(-1, 1); }
  if (kind === 'creature') {
    disc(g, '#4a3836', 19, 14, 14, 7); disc(g, '#5f4541', 17, 12, 10, 5); rect(g, '#3a2c2a', 4, 16, 8, 3); rect(g, '#3a2c2a', 26, 6, 9, 3);
    for (const [x, y] of [[12, 10], [20, 9], [24, 14]]) dot(g, '#b8ae98', x, y);
  } else {
    const L = LOOKS[kind];
    rect(g, L.boots, 3, 10, 3, 4); rect(g, L.boots, 4, 15, 3, 4);
    rect(g, L.pants, 6, 10, 9, 4); rect(g, '#35322b', 7, 15, 8, 4);
    rect(g, L.coat, 15, 8, 13, 11); rect(g, L.coatL, 15, 8, 13, 2); rect(g, L.coatD, 15, 17, 13, 2); rect(g, '#2f2c26', 15, 8, 1, 11);
    rect(g, L.accent, 19, 7, 3, 2); rect(g, L.coat, 22, 4, 4, 5); rect(g, L.coat, 20, 19, 5, 3);
    rect(g, L.head, 29, 9, 8, 8); rect(g, L.headL, 29, 9, 8, 2);
    if (L.mask) rect(g, L.mask, 31, 13, 5, 3); else rect(g, L.face, 31, 12, 5, 4);
    rect(g, L.pack, 17, 18, 9, 4);
  }
  g.restore();
  outline(c);
  return c;
}

export interface WeaponArt { canvas: HTMLCanvasElement; pivotX: number; pivotY: number; forward: number; muzzle: number }
export function paintWeapon(id: string, glove: string): WeaponArt {
  if (id === 'claw') { const { c } = canvas(2, 2); return { canvas: c, pivotX: 0, pivotY: 0, forward: 0, muzzle: 14 }; }
  if (id === 'pistol') {
    const { c, g } = canvas(16, 8);
    rect(g, '#2c2c29', 3, 3, 11, 2); rect(g, '#4a4a45', 3, 3, 11, 1); rect(g, '#2c2c29', 3, 4, 3, 3); rect(g, glove, 2, 4, 3, 3); dot(g, '#6a6a62', 13, 2);
    outline(c); return { canvas: c, pivotX: 3, pivotY: 4, forward: 8, muzzle: 8 + 12 };
  }
  if (id === 'knife') {
    const { c, g } = canvas(16, 7);
    rect(g, glove, 1, 2, 3, 3); rect(g, '#3a2f26', 3, 3, 4, 2); rect(g, '#9aa59f', 7, 3, 7, 1); rect(g, '#c7cfc8', 7, 2, 6, 1); dot(g, '#c7cfc8', 14, 3);
    outline(c); return { canvas: c, pivotX: 2, pivotY: 3, forward: 6, muzzle: 6 + 12 };
  }
  if (id === 'club') {
    const { c, g } = canvas(20, 7);
    rect(g, glove, 1, 2, 3, 3); rect(g, '#5d5a52', 3, 3, 15, 2); rect(g, '#77736a', 3, 3, 15, 1); rect(g, P.rust, 15, 2, 4, 4); rect(g, '#5e3f33', 16, 5, 2, 1);
    outline(c); return { canvas: c, pivotX: 2, pivotY: 3, forward: 4, muzzle: 4 + 17 };
  }
  if (id === 'shotgun') {
    const { c, g } = canvas(31, 10);
    rect(g, '#5a4636', 1, 3, 9, 3); rect(g, '#6e5642', 1, 3, 9, 1);
    rect(g, '#33332f', 10, 3, 5, 3); rect(g, '#2b2b28', 15, 3, 13, 1); rect(g, '#2b2b28', 15, 5, 13, 1);
    rect(g, '#4a4a44', 15, 4, 13, 1); rect(g, '#6e5642', 15, 6, 7, 2);
    rect(g, glove, 10, 5, 3, 3); rect(g, glove, 18, 6, 3, 3);
    outline(c); return { canvas: c, pivotX: 9, pivotY: 4, forward: 0, muzzle: 28 - 9 };
  }
  const rifle = id === 'rifle';
  const { c, g } = canvas(31, 10);
  rect(g, rifle ? '#4d4033' : '#5a4636', 1, 3, 7, 3); rect(g, rifle ? '#5f4f3e' : '#6e5642', 1, 3, 7, 1); rect(g, '#3a2f26', 1, 5, 2, 2);
  rect(g, '#33332f', 8, 2, 12, 4); rect(g, '#54544d', 8, 2, 12, 1);
  rect(g, '#2b2b28', 12, 6, 3, 3); rect(g, '#3d3d38', 12, 6, 1, 3);
  rect(g, '#2b2b28', 20, 3, 8, 2); rect(g, '#4a4a44', 20, 3, 8, 1); dot(g, '#5c5c55', 27, 2);
  if (rifle) rect(g, '#784d3d', 9, 1, 6, 1);
  rect(g, glove, 9, 5, 3, 3); rect(g, glove, 19, 4, 3, 3);
  line(g, '#3a3a35', 14, 1, 17, 1);
  outline(c);
  return { canvas: c, pivotX: 8, pivotY: 4, forward: 0, muzzle: 28 - 8 };
}

export function paintMuzzle(frame: number): HTMLCanvasElement {
  const { c, g } = canvas(13, 13);
  if (frame === 0) {
    disc(g, '#f3d58f', 6, 6, 4); disc(g, '#fff3cf', 6, 6, 2); rect(g, '#e9b862', 6, 0, 1, 13); rect(g, '#e9b862', 0, 6, 13, 1);
  } else { disc(g, '#d99a52', 6, 6, 3); disc(g, '#f3d58f', 6, 6, 1); dot(g, '#c37a45', 10, 3); dot(g, '#c37a45', 2, 9); }
  return c;
}
