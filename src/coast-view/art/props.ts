import { P, canvas, disc, dot, rect } from './paint';

export function paintCrate(empty: boolean): HTMLCanvasElement {
  const { c, g } = canvas(32, 28);
  rect(g, 'rgba(20,18,15,.35)', 6, 21, 24, 4);
  rect(g, P.ink, 4, 6, 24, 18);
  if (!empty) {
    rect(g, '#5b5a3f', 5, 7, 22, 9); rect(g, '#6f6e4f', 5, 7, 22, 2); rect(g, '#4a4933', 5, 14, 22, 2);
    rect(g, '#4e4d37', 5, 16, 22, 7); rect(g, '#3e3d2c', 5, 21, 22, 2);
    rect(g, '#7a6a4a', 5, 10, 22, 1); rect(g, P.label, 8, 17, 6, 3); dot(g, '#8d8670', 9, 18);
    rect(g, '#c9a24e', 15, 13, 3, 4); rect(g, '#e6c470', 15, 13, 3, 1);
  } else {
    rect(g, '#4a4933', 5, 2, 22, 6); rect(g, '#5b5a3f', 5, 2, 22, 1); rect(g, P.ink, 4, 1, 24, 1);
    rect(g, '#1d1c16', 5, 8, 22, 8); rect(g, '#2a291f', 6, 9, 20, 2);
    rect(g, '#4e4d37', 5, 16, 22, 7); rect(g, '#3e3d2c', 5, 21, 22, 2); rect(g, '#6b6550', 15, 14, 3, 2);
  }
  return c;
}

export function lootCategory(item: string): 'ammo' | 'medical' | 'valuable' | 'material' | 'weapon' | 'quest' | 'note' {
  if (['ammo9', 'ammoR', 'shell'].includes(item)) return 'ammo';
  if (['bandage', 'medkit', 'antidote'].includes(item)) return 'medical';
  if (['watch', 'pearl'].includes(item)) return 'valuable';
  if (['pistol', 'shotgun', 'carbine', 'knife'].includes(item)) return 'weapon';
  if (['sample', 'ledger'].includes(item)) return 'quest';
  if (item === 'note') return 'note';
  return 'material';
}
export function paintLoot(item: string): HTMLCanvasElement {
  const { c, g } = canvas(16, 14), cat = lootCategory(item);
  rect(g, 'rgba(20,18,15,.35)', 3, 11, 11, 2);
  if (cat === 'medical') {
    rect(g, P.ink, 3, 4, 10, 8); rect(g, '#c9c0ac', 4, 5, 8, 6); rect(g, '#a8463a', 7, 6, 2, 4); rect(g, '#a8463a', 6, 7, 4, 2);
  } else if (cat === 'note') {
    rect(g, P.ink, 3, 5, 10, 7); rect(g, P.label, 4, 6, 8, 5); rect(g, '#8d8670', 5, 7, 6, 1); rect(g, '#8d8670', 5, 9, 4, 1);
  } else if (cat === 'weapon') {
    rect(g, P.ink, 1, 6, 14, 4); rect(g, '#33332f', 2, 7, 12, 2); rect(g, '#5a4636', 2, 7, 4, 2);
  } else if (cat === 'quest') {
    rect(g, P.ink, 3, 3, 10, 9); rect(g, '#5b6461', 4, 4, 8, 7); rect(g, '#c9a24e', 6, 6, 4, 3);
  } else if (cat === 'ammo') {
    rect(g, P.ink, 3, 4, 10, 8); rect(g, '#6b6a45', 4, 5, 8, 6); rect(g, '#82805a', 4, 5, 8, 1); rect(g, '#c9a24e', 5, 7, 2, 2); rect(g, '#c9a24e', 8, 7, 2, 2);
  } else if (cat === 'valuable') {
    rect(g, P.ink, 4, 5, 8, 7); disc(g, '#9a937f', 8, 8, 3); dot(g, '#e6dcc0', 8, 7); rect(g, '#5a4636', 2, 8, 2, 1); rect(g, '#5a4636', 12, 8, 2, 1);
  } else {
    rect(g, P.ink, 2, 4, 12, 8); rect(g, '#7d7360', 3, 5, 10, 6); rect(g, '#958a73', 3, 5, 10, 1); rect(g, '#5e5646', 7, 5, 1, 6); rect(g, P.label, 9, 7, 3, 2);
  }
  return c;
}

export function paintExitDecal(): HTMLCanvasElement {
  const { c, g } = canvas(96, 96);
  const ring = (r: number, color: string) => { for (let a = 0; a < 360; a += 1) { const t = a * Math.PI / 180; if (Math.floor(a / 15) % 2 === 0) dot(g, color, Math.round(48 + Math.cos(t) * r), Math.round(48 + Math.sin(t) * r)); } };
  ring(46, '#b4ce7d'); ring(45, '#8aa05e'); ring(40, '#6f8250');
  for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) { for (let i = 0; i < 6; i++) rect(g, '#b4ce7d', 48 + dx * (30 - i) - (dy ? 3 - i / 2 : 0), 48 + dy * (30 - i) - (dx ? 3 - i / 2 : 0), dy ? 6 - i : 1, dx ? 6 - i : 1); }
  return c;
}

export function pixel(): HTMLCanvasElement { const { c, g } = canvas(1, 1); rect(g, '#ffffff', 0, 0, 1, 1); return c; }
export function blob(w: number, h: number): HTMLCanvasElement {
  const { c, g } = canvas(w, h); disc(g, 'rgba(18,16,13,0.42)', w / 2 - .5, h / 2 - .5, w / 2 - .5, h / 2 - .5); return c;
}
