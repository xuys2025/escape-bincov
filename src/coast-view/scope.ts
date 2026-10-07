export const lifecycle = { listeners: 0, tickers: 0, observers: 0, timers: 0, apps: 0, views: 0, renderTextures: 0 };

export class Scope {
  private ctrl = new AbortController();
  private cleanups: (() => void)[] = [];
  private listenerCount = 0;
  get signal() { return this.ctrl.signal; }

  on<K extends keyof WindowEventMap>(target: Window, type: K, fn: (e: WindowEventMap[K]) => void, opts?: AddEventListenerOptions): void;
  on<K extends keyof DocumentEventMap>(target: Document, type: K, fn: (e: DocumentEventMap[K]) => void, opts?: AddEventListenerOptions): void;
  on<K extends keyof HTMLElementEventMap>(target: HTMLElement, type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions): void;
  on(target: HTMLCanvasElement, type: 'webglcontextlost' | 'webglcontextrestored', fn: (e: Event) => void, opts?: AddEventListenerOptions): void;
  on(target: EventTarget, type: string, fn: (e: never) => void, opts: AddEventListenerOptions = {}) {
    target.addEventListener(type, fn as EventListener, { ...opts, signal: this.ctrl.signal });
    this.listenerCount++; lifecycle.listeners++;
  }
  observe(o: { disconnect(): void }) { lifecycle.observers++; this.cleanups.push(() => { o.disconnect(); lifecycle.observers--; }); }
  timeout(fn: () => void, ms: number) {
    lifecycle.timers++;
    const id = setTimeout(() => { lifecycle.timers--; done(); fn(); }, ms);
    const cancel = () => { clearTimeout(id); lifecycle.timers--; };
    const done = () => { const i = this.cleanups.indexOf(cancel); if (i >= 0) this.cleanups.splice(i, 1); };
    this.cleanups.push(cancel);
  }
  add(cleanup: () => void) { this.cleanups.push(cleanup); }
  dispose() {
    this.ctrl.abort(); lifecycle.listeners -= this.listenerCount; this.listenerCount = 0;
    for (const c of this.cleanups.splice(0).reverse()) { try { c(); } catch (e) { console.error(e); } }
  }
}
