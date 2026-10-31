// Sprite strips are composed at runtime from the game's own frame files (copied unchanged by
// scripts/site/build.mjs), so the site keeps no derived copy of the art.
const cache = new Map();

function load(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('frame failed: ' + url));
    img.src = url;
  });
}

/** Lays the frames side by side and resolves to a data URL usable as a CSS background. */
export function strip(urls) {
  const key = urls.join('|');
  if (!cache.has(key)) {
    cache.set(key, Promise.all(urls.map(load)).then(frames => {
      const w = frames[0].naturalWidth, h = frames[0].naturalHeight;
      const canvas = document.createElement('canvas');
      canvas.width = w * frames.length; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      frames.forEach((f, i) => ctx.drawImage(f, i * w, 0));
      return canvas.toDataURL('image/png');
    }));
  }
  return cache.get(key);
}

export const enemyFrames = id => [0, 1, 2, 3, 4].map(n => `assets/enemy/${id}-${n}.png`);
export const npcFrames = id => ['idle-0', 'idle-1', 'talk-0', 'talk-1'].map(f => `assets/npc/${id}-${f}.png`);
