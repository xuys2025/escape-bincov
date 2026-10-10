// Build-specific names the R3 heap diagnostics read in a packaged (minified) build: constructor names as V8 snapshots
// show them, and the module variable that holds Pixi's createIdFromString cache. Each is derived from a marker in the
// recorded HTML and must resolve exactly once; the build's SHA-256 must also be listed in VERIFIED with the same names,
// so analysing a new build means re-deriving, checking the names against its code, and adding one row here.
import { createHash } from 'node:crypto';

export const VERIFIED = {
  // Astra R3 (7a4dc75 product, 5075ed6 build): hand-mapped aliases; derivation reproduces them.
  'ce732ff66cc80c5da1b5a041eec16d16438ad977f3f52c706a18a771159a6a62': { idHash: 'XT', QuadGeometry: 'Ep', Buffer: 'Fi', CanvasSource: 'xe', TextureSource: 'gb', Texture: 'ft', RenderTexture: 'c', HideoutScene: 'rm' },
  // Opus R3 fix build: derived, then each checked against its declaration (lr/jT createIdFromString; wp quad
  // positions/uvs; Di buffer; xe canvas source; Tb textureSource uid; ft texture; f RenderTexture.create; am scene).
  '112e7c8e37c91a218351b2fee03c008872bee5ca563d4262e431a57a845c5ef1': { idHash: 'jT', QuadGeometry: 'wp', Buffer: 'Di', CanvasSource: 'xe', TextureSource: 'Tb', Texture: 'ft', RenderTexture: 'f', HideoutScene: 'am' },
};

const once = (html, needle) => {
  const at = html.indexOf(needle);
  if (at < 0 || html.indexOf(needle, at + 1) >= 0) throw Error(`Marker must occur exactly once: ${needle}`);
  return at;
};
/** The class expression whose body holds `needle`: its inner name if it has one (V8 uses that), else the binding. */
const classAt = (html, needle) => {
  const at = once(html, needle), start = html.lastIndexOf('=class', at);
  const m = /([\w$]+)=class(?: (?!extends )([\w$]+))?[ {]/.exec(html.slice(start - 40, start + 60));
  if (!m) throw Error('No class before ' + needle);
  return m[2] ?? m[1];
};
export function deriveNames(html) {
  const key = /([\w$]+)\(`\$\{this\.vertex\}:\$\{this\.fragment\}`,"gl-program"\)/g, calls = [...html.matchAll(key)];
  if (calls.length !== 1) throw Error('GlProgram key call must occur once');
  const fn = calls[0][1].replace(/\$/g, '\\$');
  const hash = [...html.matchAll(new RegExp(`function ${fn}\\([\\w$]+,[\\w$]+\\)\\{let [\\w$]+=([\\w$]+)\\[`, 'g'))];
  if (hash.length !== 1) throw Error('createIdFromString body changed');
  const rt = [...html.matchAll(/([\w$]+)=class(?: ([\w$]+))? extends ([\w$]+)\{static create\([\w$]+\)\{let\{dynamic:/g)];
  if (rt.length !== 1) throw Error('RenderTexture.create marker must occur once');
  const names = {
    idHash: hash[0][1],
    QuadGeometry: classAt(html, 'super({positions:new Float32Array([0,0,1,0,1,1,0,1]),uvs:new Float32Array([0,0,1,0,1,1,0,1])'),
    Buffer: classAt(html, 'this._resourceType="buffer"'),
    CanvasSource: classAt(html, 'resizeCanvas(){'),
    TextureSource: classAt(html, '("textureSource")'),
    Texture: classAt(html, '("texture")'),
    RenderTexture: rt[0][2] ?? rt[0][1],
    HideoutScene: classAt(html, 'X(this,"wallCellTextures",new Map)'),
  };
  if (rt[0][3] !== /([\w$]+)=class(?: [\w$]+)? extends/.exec(html.slice(html.lastIndexOf('=class', once(html, '("texture")')) - 40))?.[1]) throw Error('RenderTexture must extend Texture');
  return names;
}
/** Names for a build whose derivation matches its VERIFIED row; throws for any other build. */
export function buildNames(html) {
  const sha256 = createHash('sha256').update(html).digest('hex'), derived = deriveNames(html), verified = VERIFIED[sha256];
  if (!verified) throw Error(`Build ${sha256} not verified: derived ${JSON.stringify(derived)}; check them against the build and add a VERIFIED row`);
  if (JSON.stringify(derived) !== JSON.stringify(verified)) throw Error(`Derived names ${JSON.stringify(derived)} differ from VERIFIED ${JSON.stringify(verified)}`);
  return { sha256, ...verified };
}
