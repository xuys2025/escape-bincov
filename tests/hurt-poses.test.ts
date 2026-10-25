import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IMPORTER, MANIFEST, cutPoses, driftMap, idlePath, importerText, manifestText, restoreDrift, samePixels, type PoseAsset } from '../scripts/export-hurt-poses';
import { decodePng, type RGBA } from '../scripts/title-art/png';

const committed = () => JSON.parse(readFileSync(MANIFEST, 'utf8')) as { sources: Record<string, string>; assets: PoseAsset[] };

test('受击姿态：70 张运行帧、清单和导入文件与 #96 的 pixel-v2 图集一致（A 组四类敌人、B 组三类原型 × 五朝向 × 受击/恢复）', () => {
  const { sources, entries } = cutPoses(), manifest = committed();
  assert.equal(entries.length, 70);
  assert.deepEqual(manifest.sources, sources);
  entries.forEach(({ asset, frame }, i) => {
    assert.ok(samePixels(decodePng(readFileSync(asset.file)), frame), `${asset.file} pixels`);
    assert.deepEqual({ ...manifest.assets[i], sha256: '' }, asset);
  });
  assert.equal(readFileSync(MANIFEST, 'utf8'), manifestText(sources, manifest.assets));
  assert.equal(readFileSync(IMPORTER, 'utf8'), importerText(manifest.assets));
});

test('受击姿态：脚底四行不动，人形肩点所在的第 19、20 行不动，不新增颜色；头顶受击下移 2、恢复下移 1', () => {
  const opaque = (f: RGBA, x: number, y: number) => f.data[(y * f.w + x) * 4 + 3] > 0;
  const rows = (f: RGBA) => Array.from({ length: f.h }, (_, y) => Array.from({ length: f.w }, (_, x) => opaque(f, x, y)).some(Boolean));
  const row = (f: RGBA, y: number) => Buffer.from(f.data.subarray(y * f.w * 4, (y + 1) * f.w * 4)).toString('hex');
  const colours = (f: RGBA) => new Set(Array.from({ length: f.w * f.h }, (_, p) => p * 4).filter(i => f.data[i + 3] > 0).map(i => row({ ...f, w: 1, data: f.data.subarray(i, i + 4) }, 0)));
  for (const { asset, frame } of cutPoses().entries) {
    const idle = decodePng(readFileSync(idlePath(asset.kind, asset.dir.toLowerCase()))), name = `${asset.kind} ${asset.dir} ${asset.pose}`;
    const top = (f: RGBA) => rows(f).indexOf(true), bottom = rows(idle).lastIndexOf(true);
    assert.equal(top(frame) - top(idle), asset.pose === 'hurt' ? 2 : 1, `${name}: head drop`);
    for (let y = bottom - 3; y <= bottom; y++) assert.equal(row(frame, y), row(idle, y), `${name}: feet row ${y}`);
    if (idle.h === 48) for (const y of [19, 20]) assert.equal(row(frame, y), row(idle, y), `${name}: shoulder row ${y} (the arms start there)`);
    const own = colours(idle);
    assert.deepEqual([...colours(frame)].filter(c => !own.has(c)), [], `${name}: new colours`);
  }
});

test('受击姿态：图集站立格只许半透明像素差一级（画布取整），切帧时还原成运行帧的颜色；其他差异一律拒绝', () => {
  const frame = (...pixels: number[][]) => ({ w: pixels.length, h: 1, data: new Uint8Array(pixels.flat()) });
  const idle = frame([0x80, 0x6d, 0x5b, 14], [0x2b, 0x25, 0x22, 252], [10, 20, 30, 255], [0, 0, 0, 0]);
  const map = driftMap(frame([0x7f, 0x6d, 0x5b, 14], [0x2a, 0x25, 0x22, 252], [10, 20, 30, 255], [9, 9, 9, 0]), idle, 'drift');
  assert.equal(map.size, 2);
  assert.deepEqual(Array.from(restoreDrift(frame([0x2a, 0x25, 0x22, 252], [0x7f, 0x6d, 0x5b, 14], [1, 2, 3, 255]), map).data),
    [0x2b, 0x25, 0x22, 252, 0x80, 0x6d, 0x5b, 14, 1, 2, 3, 255]);
  const rejects = (sheet: ReturnType<typeof frame>, base: ReturnType<typeof frame>, why: RegExp) => assert.throws(() => driftMap(sheet, base, 'drift'), why);
  rejects(frame([0x7e, 0x6d, 0x5b, 14], [0x2b, 0x25, 0x22, 252], [10, 20, 30, 255], [0, 0, 0, 0]), idle, /not the runtime idle frame at \(0,0\)/);
  rejects(frame([0x80, 0x6d, 0x5b, 15], [0x2b, 0x25, 0x22, 252], [10, 20, 30, 255], [0, 0, 0, 0]), idle, /not the runtime idle frame at \(0,0\)/);
  rejects(frame([0x80, 0x6d, 0x5b, 14], [0x2b, 0x25, 0x22, 252], [11, 20, 30, 255], [0, 0, 0, 0]), idle, /not the runtime idle frame at \(2,0\)/);
  rejects(frame([0x80, 0x6d, 0x5b, 14], [0x2b, 0x25, 0x22, 252], [10, 20, 30, 255], [1, 1, 1, 9]), idle, /not the runtime idle frame at \(3,0\)/);
  rejects(frame([0x7f, 0x6d, 0x5b, 14], [0x7f, 0x6d, 0x5b, 14]), frame([0x80, 0x6d, 0x5b, 14], [0x7e, 0x6d, 0x5b, 14]), /stands for two runtime colours/);
  rejects(frame([0x7f, 0x6d, 0x5b, 14], [0x7f, 0x6d, 0x5b, 14]), frame([0x80, 0x6d, 0x5b, 14], [0x7f, 0x6d, 0x5b, 14]), /is also an idle colour/);
});
