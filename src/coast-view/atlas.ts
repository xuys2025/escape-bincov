import { CanvasSource, Rectangle, Texture } from 'pixi.js';

const PAGE = 2048, PAD = 2;

interface Page { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D; x: number; y: number; row: number; source: CanvasSource | null; dirty: boolean }

export class Atlas {
  private pages: Page[] = [];
  private frames = new Map<string, { page: Page; rect: Rectangle; texture: Texture | null }>();
  private large = new Map<string, Texture>();
  stats = { frames: 0, pages: 0, largeTextures: 0, bytes: 0 };

  has(key: string) { return this.frames.has(key) || this.large.has(key); }

  add(key: string, src: HTMLCanvasElement, standalone = false): string {
    if (this.has(key)) return key;
    if (standalone || src.width > 512 || src.height > 512) {
      const source = new CanvasSource({ resource: src, scaleMode: 'nearest' });
      const t = new Texture({ source });
      this.large.set(key, t); this.stats.largeTextures++; this.stats.bytes += src.width * src.height * 4;
      return key;
    }
    let page = this.pages[this.pages.length - 1];
    const w = src.width + PAD * 2, h = src.height + PAD * 2;
    if (!page || !this.fit(page, w, h)) { page = this.newPage(); if (!this.fit(page, w, h)) throw new Error(`Asset too large: ${key}`); }
    if (page.x + w > PAGE) { page.x = 0; page.y += page.row; page.row = 0; }
    page.g.drawImage(src, page.x + PAD, page.y + PAD);
    this.frames.set(key, { page, rect: new Rectangle(page.x + PAD, page.y + PAD, src.width, src.height), texture: null });
    page.x += w; page.row = Math.max(page.row, h); page.dirty = true; this.stats.frames++;
    return key;
  }

  private fit(p: Page, w: number, h: number) {
    if (p.x + w <= PAGE && p.y + Math.max(p.row, h) <= PAGE) return true;
    return p.y + p.row + h <= PAGE && w <= PAGE;
  }
  private newPage(): Page {
    const canvas = document.createElement('canvas'); canvas.width = PAGE; canvas.height = PAGE;
    const g = canvas.getContext('2d')!; g.imageSmoothingEnabled = false;
    const p: Page = { canvas, g, x: 0, y: 0, row: 0, source: null, dirty: true };
    this.pages.push(p); this.stats.pages++; this.stats.bytes += PAGE * PAGE * 4;
    return p;
  }

  get(key: string): Texture {
    const big = this.large.get(key); if (big) return big;
    const f = this.frames.get(key); if (!f) throw new Error(`Missing asset: ${key}`);
    if (!f.page.source) f.page.source = new CanvasSource({ resource: f.page.canvas, scaleMode: 'nearest' });
    else if (f.page.dirty) f.page.source.update();
    f.page.dirty = false;
    if (!f.texture) f.texture = new Texture({ source: f.page.source, frame: f.rect });
    return f.texture;
  }

  drop(key: string) {
    const t = this.large.get(key); if (!t) return;
    this.stats.bytes -= t.source.pixelWidth * t.source.pixelHeight * 4;
    t.destroy(true); this.large.delete(key); this.stats.largeTextures--;
  }
  destroy() {
    for (const k of [...this.large.keys()]) this.drop(k);
    for (const f of this.frames.values()) f.texture?.destroy(false);
    for (const p of this.pages) { p.source?.destroy(); p.canvas.width = p.canvas.height = 0; }
    this.frames.clear(); this.pages = []; this.stats = { frames: 0, pages: 0, largeTextures: 0, bytes: 0 };
  }
  dropPrefix(prefix: string) { for (const k of [...this.large.keys()]) if (k.startsWith(prefix)) this.drop(k); }
}
