import { readFile, mkdir, stat, writeFile } from 'node:fs/promises';
import { deflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { basename, dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const game = resolve(root, 'start the game.html');
const readme = resolve(root, 'README-游玩说明.txt');
const output = resolve(root, 'release', 'Escape-Bincov-portable.zip');
const [portable, original] = await Promise.all([
  readFile(game), readFile(resolve(root, 'dist', 'index.html')),
]);
if (!portable.equals(original)) throw new Error('Portable entry is out of date. Run pnpm build first.');
await stat(readme);
await mkdir(resolve(root, 'release'), { recursive: true });
// Standard ZIP32/DEFLATE, with UTF-8 names. Only two small files are packaged;
// Node's built-in zlib avoids a system archiver or additional dependency.
const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  return crc >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
async function writeArchive(output, files) {
const localParts = [], centralParts = [];
let offset = 0;
for (const [path, entryName] of files) {
  const bytes = await readFile(path), compressed = deflateRawSync(bytes, { level: 9 });
  if (bytes.length > 0xffffffff) throw new Error('ZIP32 size limit exceeded');
  const name = Buffer.from(entryName, 'utf8'), checksum = crc32(bytes);
  // Fixed ZIP timestamp makes identical releases reproducible across machines.
  const modified = new Date('2000-01-01T00:00:00Z');
  const dosTime = (modified.getUTCHours() << 11) | (modified.getUTCMinutes() << 5) | (modified.getUTCSeconds() >> 1);
  const dosDate = ((Math.max(1980, Math.min(2107, modified.getUTCFullYear())) - 1980) << 9) | ((modified.getUTCMonth() + 1) << 5) | modified.getUTCDate();
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x800, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt16LE(dosTime, 10);
  local.writeUInt16LE(dosDate, 12);
  local.writeUInt32LE(checksum, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(bytes.length, 22);
  local.writeUInt16LE(name.length, 26);
  localParts.push(local, name, compressed);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(dosTime, 12);
  central.writeUInt16LE(dosDate, 14);
  central.writeUInt32LE(checksum, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(bytes.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(offset, 42);
  centralParts.push(central, name);
  offset += local.length + name.length + compressed.length;
}
const central = Buffer.concat(centralParts), end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(central.length, 12);
end.writeUInt32LE(offset, 16);
await writeFile(output, Buffer.concat([...localParts, central, end]));
}
await writeArchive(output, [[game, basename(game)], [readme, basename(readme)]]);
const webOutput = resolve(root, 'release', 'Escape-Bincov-web.zip');
await writeArchive(webOutput, [[resolve(root, 'dist', 'index.html'), 'index.html']]);
const artifacts = {};
for (const name of ['dist/index.html', 'start the game.html', 'release/Escape-Bincov-portable.zip', 'release/Escape-Bincov-web.zip']) {
  const bytes = await readFile(resolve(root, name));
  artifacts[name] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}
const { version } = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
// CI stamps the commit and run it built, so the published manifest names its own source: the release's tag and files
// are replaced on every validated main, and the mirror checks one file instead of a tag that may move meanwhile.
// Local packages leave both out.
const { BINCOV_BUILD_COMMIT: commit, BINCOV_BUILD_RUN: run } = process.env;
if ((commit || run) && !(/^[0-9a-f]{40}$/.test(commit ?? '') && /^[1-9]\d*$/.test(run ?? ''))) {
  throw new Error('BINCOV_BUILD_COMMIT needs a full commit SHA and BINCOV_BUILD_RUN a run ID, together.');
}
const build = commit ? { commit, run: Number(run) } : {};
// The release manifest ships with the ZIPs (CI publishes all three after main is validated; see docs/CI.md).
await writeFile(resolve(root, 'release', 'release-manifest.json'), JSON.stringify({ version, ...build, htmlBytes: portable.length, htmlSha256: artifacts['dist/index.html'].sha256, artifacts }, null, 2) + '\n');
console.log(`Portable ZIP: ${output} (${(await stat(output)).size} bytes)`);
console.log(`Web upload ZIP: ${webOutput} (${(await stat(webOutput)).size} bytes)`);
console.log('Share the ZIP, or just start the game.html. No install, server or internet required.');
