import { build } from 'esbuild';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { fontCharacters } from './font-characters.mjs';

async function compile() {
  const titleManifest = JSON.parse(await readFile('assets/title/manifest.json','utf8'));
  if (titleManifest.schema !== 2) throw new Error('Prepare the imported title art manifest with pnpm title:art.');
  const titleImports = [...(await readFile('src/title/assets.ts','utf8')).matchAll(/from '\.\.\/\.\.\/(assets\/title\/[^']+\.png)'/g)].map(m => m[1]).sort();
  const titleFiles = Object.values(titleManifest.layers).map(layer => layer.file).sort();
  if (JSON.stringify(titleImports) !== JSON.stringify(titleFiles)) throw new Error('Title manifest does not cover the runtime imports.');
  for (const layer of Object.values(titleManifest.layers)) {
    const bytes = await readFile(layer.file);
    if (createHash('sha256').update(bytes).digest('hex') !== layer.sha256) throw new Error(`Title asset hash mismatch: ${layer.file}. Review the changed source before preparing derivatives.`);
    if (bytes.readUInt32BE(16) !== layer.frameWidth * layer.frames || bytes.readUInt32BE(20) !== layer.frameHeight) throw new Error(`Title dimensions mismatch: ${layer.file}`);
  }
  for (const [file, sha256] of Object.entries(titleManifest.sources)) if (createHash('sha256').update(await readFile(file)).digest('hex') !== sha256) throw new Error(`Title source changed: ${file}`);
  // Coast sample assets: every runtime PNG must match its manifest hash, and the importer must cover exactly the manifest.
  const coast = JSON.parse(await readFile('assets/coast/manifest.json','utf8'));
  const coastImports = [...(await readFile('src/coast-view/assets.ts','utf8')).matchAll(/from '\.\.\/\.\.\/(assets\/coast\/[^']+\.png)'/g)].map(m => m[1]).sort();
  if (JSON.stringify(coastImports) !== JSON.stringify(coast.assets.map(a => a.file).sort())) throw new Error('Coast asset imports do not match assets/coast/manifest.json.');
  for (const a of coast.assets) if (createHash('sha256').update(await readFile(a.file)).digest('hex') !== a.sha256) throw new Error(`Coast asset hash mismatch: ${a.file}`);
  const result = await build({entryPoints:['src/main.ts'],bundle:true,write:false,minify:true,target:'es2020',format:'iife',legalComments:'inline',loader:{'.png':'dataurl'},define:{'process.env.NODE_ENV':'"production"'}});
  const font = await readFile('assets/fonts/bincov-text.woff2');
  const manifest = JSON.parse(await readFile('assets/fonts/manifest.json','utf8'));
  if (createHash('sha256').update(font).digest('hex') !== manifest.sha256) throw new Error('Font manifest hash mismatch');
  const missing = [...await fontCharacters()].filter(c => !manifest.codepoints.includes(c.codePointAt(0)));
  if (missing.length) throw new Error('Regenerate the embedded font for: ' + missing.join(''));
  const fontCss = `@font-face{font-family:"Bincov Text";src:url(data:font/woff2;base64,${font.toString('base64')}) format("woff2");font-weight:400;font-style:normal;font-display:swap;}\n`;
  const css = fontCss + (await Promise.all(['src/style.css', 'src/title.css', 'src/tactical.css', 'src/coast-view/coast.css'].map(path => readFile(path, 'utf8')))).join('\n');
  const notices = (await readFile('THIRD_PARTY_NOTICES.md','utf8')).replace(/-->/g,'--&gt;');
  const js = result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><!--\n${notices}\n--><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#10272b"><title>逃离滨科夫 · Escape Bincov</title><style>${css}</style></head><body><main id="frame"><div id="game"></div><div id="ui"></div><div id="touch-controls"></div><div id="world-labels" aria-hidden="true"></div></main><div id="toast" role="status"></div><script>${js}</script></body></html>`;
  await mkdir('dist',{recursive:true});
  await writeFile('dist/index.html',html);
  await writeFile('start the game.html',html);
  console.log(`Built dist/index.html and start the game.html (${(Buffer.byteLength(html)/1024/1024).toFixed(2)} MB each), completely offline.`);
  return html;
}
let html = await compile();
if(process.argv.includes('--serve')) {
  createServer(async(req,res)=>{try { if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return;} html=await compile();res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(html); }catch(e){res.writeHead(500);res.end(String(e));}}).listen(4173,'127.0.0.1',()=>console.log('Local game: http://127.0.0.1:4173'));
}
