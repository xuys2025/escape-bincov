import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { fontCharacters } from './font-characters.mjs';
import { buildGameScript, inlineScript } from './game-bundle.mjs';

async function compile() {
  const titleManifest = JSON.parse(await readFile('assets/title/manifest.json','utf8'));
  if (titleManifest.schema !== 2) throw new Error('Prepare the imported title art manifest with pnpm title:art.');
  const titleImports = [...(await readFile('src/title/art.ts','utf8')).matchAll(/from '\.\.\/\.\.\/(assets\/title\/[^']+\.png)'/g)].map(m => m[1]).sort();
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
  const packed = JSON.parse(await readFile('assets/coast/packed/manifest.json','utf8'));
  const coastSource = await readFile('src/coast-view/assets.ts','utf8');
  const coastImports = [...coastSource.matchAll(/from '\.\.\/\.\.\/(assets\/coast\/[^']+\.webp)'/g)].map(m => m[1]).sort();
  if (packed.schema !== 1 || JSON.stringify(coastImports) !== JSON.stringify(packed.sheets.map(a => a.file).sort())
    || packed.frames.length !== coast.assets.length || new Set(packed.frames.map(a => a.id)).size !== coast.assets.length)
    throw new Error('Packed coast imports or coverage do not match the manifest.');
  for (const sheet of packed.sheets) {
    const bytes = await readFile(sheet.file);
    if (bytes.length !== sheet.bytes || createHash('sha256').update(bytes).digest('hex') !== sheet.sha256)
      throw new Error(`Packed coast sheet hash mismatch: ${sheet.file}`);
  }
  for (const frame of packed.frames) {
    const original = coast.assets.find(a => a.id === frame.id), index = packed.sheets.findIndex(s => s.file === frame.sheet), sheet = packed.sheets[index];
    if (!original || !sheet || frame.sourceSha256 !== original.sha256 || frame.w !== original.w || frame.h !== original.h
      || !Number.isInteger(frame.x) || !Number.isInteger(frame.y) || frame.x < 0 || frame.y < 0
      || frame.x + frame.w > sheet.w || frame.y + frame.h > sheet.h
      || !coastSource.includes(`['${frame.id}', sheet${index}, ${frame.x}, ${frame.y}, ${frame.w}, ${frame.h}]`))
      throw new Error(`Packed coast frame mismatch: ${frame.id}`);
  }
  for (const a of coast.assets) if (createHash('sha256').update(await readFile(a.file)).digest('hex') !== a.sha256) throw new Error(`Coast asset hash mismatch: ${a.file}`);
  const enemyArt = JSON.parse(await readFile('assets/enemies/manifest.json', 'utf8'));
  for (const [file, sha256] of Object.entries(enemyArt.sources)) {
    if (createHash('sha256').update(await readFile(file)).digest('hex') !== sha256) throw new Error(`Enemy art source changed: ${file}`);
  }
  for (const a of enemyArt.assets) {
    const bytes = await readFile(a.file);
    if (bytes.readUInt32BE(16) !== a.w || bytes.readUInt32BE(20) !== a.h) throw new Error(`Enemy frame size mismatch: ${a.file}`);
    if (coast.assets.find(c => c.id === a.id)?.sha256 !== a.sha256) throw new Error(`Enemy art manifest mismatch: ${a.id}`);
  }
  // Station yard art (Sol R1.1): same rule as the coast sample, plus the PNG size recorded in the manifest.
  const station = JSON.parse(await readFile('assets/station/manifest.json','utf8'));
  const stationImports = [...(await readFile('src/station-view/assets.ts','utf8')).matchAll(/from '\.\.\/\.\.\/(assets\/station\/[^']+\.png)'/g)].map(m => m[1]).sort();
  if (JSON.stringify(stationImports) !== JSON.stringify(station.assets.map(a => a.file).sort())) throw new Error('Station asset imports do not match assets/station/manifest.json. Run node scripts/station-assets.mjs.');
  for (const a of station.assets) {
    const bytes = await readFile(a.file);
    if (createHash('sha256').update(bytes).digest('hex') !== a.sha256) throw new Error(`Station asset hash mismatch: ${a.file}`);
    if (bytes.readUInt32BE(16) !== a.w || bytes.readUInt32BE(20) !== a.h) throw new Error(`Station asset size mismatch: ${a.file}`);
  }
  // Mall art (Sol, issue #47): same rule as the station yard.
  const mall = JSON.parse(await readFile('assets/mall/manifest.json','utf8'));
  const mallImports = [...(await readFile('src/coast-view/mall-assets.ts','utf8')).matchAll(/from '\.\.\/\.\.\/(assets\/mall\/[^']+\.png)'/g)].map(m => m[1]).sort();
  if (JSON.stringify(mallImports) !== JSON.stringify(mall.assets.map(a => a.file).sort())) throw new Error('Mall asset imports do not match assets/mall/manifest.json. Run node scripts/mall-assets.mjs.');
  for (const a of mall.assets) {
    const bytes = await readFile(a.file);
    if (createHash('sha256').update(bytes).digest('hex') !== a.sha256) throw new Error(`Mall asset hash mismatch: ${a.file}`);
    if (bytes.readUInt32BE(16) !== a.w || bytes.readUInt32BE(20) !== a.h) throw new Error(`Mall asset size mismatch: ${a.file}`);
  }
  // Opening cutscene art (Sol): same rule as the station yard.
  const opening = JSON.parse(await readFile('assets/opening/manifest.json','utf8'));
  const openingImports = [...(await readFile('src/opening/assets.ts','utf8')).matchAll(/from '\.\.\/\.\.\/(assets\/opening\/[^']+\.png)'/g)].map(m => m[1]).sort();
  if (JSON.stringify(openingImports) !== JSON.stringify(opening.assets.map(a => a.file).sort())) throw new Error('Opening asset imports do not match assets/opening/manifest.json.');
  for (const a of opening.assets) {
    const bytes = await readFile(a.file);
    if (createHash('sha256').update(bytes).digest('hex') !== a.sha256) throw new Error(`Opening asset hash mismatch: ${a.file}`);
    if (bytes.readUInt32BE(16) !== a.w || bytes.readUInt32BE(20) !== a.h) throw new Error(`Opening asset size mismatch: ${a.file}`);
  }
  const county = JSON.parse(await readFile('assets/county-map/manifest.json', 'utf8'));
  for (const [file, hash] of [[county.source, county.sourceSha256], [county.output, county.sha256]]) {
    if (createHash('sha256').update(await readFile(file)).digest('hex') !== hash) throw new Error(`County map hash mismatch: ${file}`);
  }
  // County briefing art: the deploy panel imports exactly the terrain and the twelve briefing WebPs of the manifests.
  const briefing = JSON.parse(await readFile('assets/county-map/briefing-concepts/manifest.json', 'utf8'));
  const briefingFile = a => `assets/county-map/briefing-concepts/${a.file}`;
  const countyImports = [...(await readFile('src/station-view/county-art.ts','utf8')).matchAll(/from '\.\.\/\.\.\/(assets\/county-map\/[^']+\.webp)'/g)].map(m => m[1]).sort();
  if (JSON.stringify(countyImports) !== JSON.stringify([county.output, ...briefing.assets.map(briefingFile)].sort())) throw new Error('County art imports do not match the county map manifests.');
  for (const a of briefing.assets) if (createHash('sha256').update(await readFile(briefingFile(a))).digest('hex') !== a.sha256) throw new Error(`County briefing art hash mismatch: ${a.file}`);
  // Hurt and recovery body frames (#75): the importer covers exactly the pose manifest, and every frame and source sheet
  // matches its hash (node --import tsx scripts/export-hurt-poses.ts writes them; --check compares the pixels).
  const poses = JSON.parse(await readFile('assets/coast/poses/manifest.json', 'utf8'));
  const poseImports = [...(await readFile('src/coast-view/pose-assets.ts','utf8')).matchAll(/from '\.\.\/\.\.\/(assets\/coast\/poses\/[^']+\.png)'/g)].map(m => m[1]).sort();
  if (JSON.stringify(poseImports) !== JSON.stringify(poses.assets.map(a => a.file).sort())) throw new Error('Pose frame imports do not match assets/coast/poses/manifest.json. Run node --import tsx scripts/export-hurt-poses.ts.');
  for (const [file, hash] of [...Object.entries(poses.sources), ...poses.assets.map(a => [a.file, a.sha256])])
    if (createHash('sha256').update(await readFile(file)).digest('hex') !== hash) throw new Error(`Pose frame hash mismatch: ${file}`);
  const js = inlineScript(await buildGameScript());
  const font = await readFile('assets/fonts/bincov-text.woff2');
  const manifest = JSON.parse(await readFile('assets/fonts/manifest.json','utf8'));
  if (createHash('sha256').update(font).digest('hex') !== manifest.sha256) throw new Error('Font manifest hash mismatch');
  const missing = [...await fontCharacters()].filter(c => !manifest.codepoints.includes(c.codePointAt(0)));
  if (missing.length) throw new Error('Regenerate the embedded font for: ' + missing.join(''));
  const fontCss = `@font-face{font-family:"Bincov Text";src:url(data:font/woff2;base64,${font.toString('base64')}) format("woff2");font-weight:400;font-style:normal;font-display:swap;}\n`;
  const css = fontCss + (await Promise.all(['src/style.css', 'src/title.css', 'src/tactical.css', 'src/coast-view/coast.css'].map(path => readFile(path, 'utf8')))).join('\n');
  const notices = (await readFile('THIRD_PARTY_NOTICES.md','utf8')).replace(/-->/g,'--&gt;');
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><!--\n${notices}\n--><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#10272b"><title>逃离滨科夫 · Escape Bincov</title><style>${css}</style></head><body><main id="frame"><div id="game"></div><div id="ui"></div></main><div id="toast" role="status"></div><script>${js}</script></body></html>`;
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
