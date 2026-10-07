/** Lossless 8-bit PNG I/O for imported RGBA and legacy indexed artwork. */
import { inflateSync, deflateSync, crc32 } from 'node:zlib';
export type RGBA = {
    w: number;
    h: number;
    data: Uint8Array;
};
export function decodePng(bytes: Buffer): RGBA {
    if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
        throw new Error('Invalid PNG signature');
    let w = 0, h = 0, type = 0, palette: Buffer = Buffer.alloc(0), alpha: Buffer = Buffer.alloc(0);
    const idat: Buffer[] = [];
    for (let p = 8; p < bytes.length;) {
        const size = bytes.readUInt32BE(p), kind = bytes.toString('ascii', p + 4, p + 8), b = bytes.subarray(p + 8, p + 8 + size);
        if (crc32(bytes.subarray(p + 4, p + 8 + size)) !== bytes.readUInt32BE(p + 8 + size))
            throw new Error('PNG CRC: ' + kind);
        if (kind === 'IHDR') {
            w = b.readUInt32BE(0);
            h = b.readUInt32BE(4);
            type = b[9];
            if (b[8] !== 8 || b[12] !== 0 || ![2, 3, 6].includes(type))
                throw new Error('Expected non-interlaced 8-bit RGB/RGBA/indexed PNG');
        }
        else if (kind === 'PLTE')
            palette = b;
        else if (kind === 'tRNS')
            alpha = b;
        else if (kind === 'IDAT')
            idat.push(b);
        p += size + 12;
    }
    const channels = type === 6 ? 4 : type === 2 ? 3 : 1, stride = w * channels, packed = inflateSync(Buffer.concat(idat)), raw = new Uint8Array(stride * h), data = new Uint8Array(w * h * 4);
    const paeth = (a: number, b: number, c: number) => { const p = a + b - c, x = Math.abs(p - a), y = Math.abs(p - b), z = Math.abs(p - c); return x <= y && x <= z ? a : y <= z ? b : c; };
    if (packed.length !== (stride + 1) * h)
        throw new Error('PNG row size mismatch');
    for (let y = 0; y < h; y++) {
        const filter = packed[y * (stride + 1)];
        if (filter > 4)
            throw new Error('Invalid PNG filter');
        for (let x = 0; x < stride; x++) {
            const a = x >= channels ? raw[y * stride + x - channels] : 0, b = y ? raw[(y - 1) * stride + x] : 0, c = y && x >= channels ? raw[(y - 1) * stride + x - channels] : 0;
            raw[y * stride + x] = packed[y * (stride + 1) + x + 1] + [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter];
        }
    }
    for (let i = 0; i < w * h; i++) {
        const q = i * 4, p = i * channels;
        if (type === 3) {
            const c = raw[p];
            data[q] = palette[c * 3];
            data[q + 1] = palette[c * 3 + 1];
            data[q + 2] = palette[c * 3 + 2];
            data[q + 3] = alpha[c] ?? 255;
        }
        else {
            data[q] = raw[p];
            data[q + 1] = raw[p + 1];
            data[q + 2] = raw[p + 2];
            data[q + 3] = type === 6 ? raw[p + 3] : 255;
        }
    }
    return { w, h, data };
}
export function encodePng({ w, h, data }: RGBA): Buffer {
    const chunk = (name: string, payload: Buffer) => { const head = Buffer.alloc(8), tail = Buffer.alloc(4); head.writeUInt32BE(payload.length); head.write(name, 4); tail.writeUInt32BE(crc32(Buffer.concat([Buffer.from(name), payload]))); return Buffer.concat([head, payload, tail]); };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8;
    // Limited-palette art is stored losslessly as indexed colour (with per-entry alpha).
    const colours = new Map<number, number>();
    for (let i = 0; i < w * h && colours.size <= 256; i++) {
        const v = ((data[i * 4] << 24) | (data[i * 4 + 1] << 16) | (data[i * 4 + 2] << 8) | data[i * 4 + 3]) >>> 0;
        if (!colours.has(v)) colours.set(v, colours.size);
    }
    if (colours.size <= 256) {
        ihdr[9] = 3;
        const plte = Buffer.alloc(colours.size * 3), trns = Buffer.alloc(colours.size);
        for (const [v, k] of colours) { plte[k * 3] = v >>> 24; plte[k * 3 + 1] = (v >>> 16) & 255; plte[k * 3 + 2] = (v >>> 8) & 255; trns[k] = v & 255; }
        const raw = Buffer.alloc((w + 1) * h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            raw[y * (w + 1) + 1 + x] = colours.get(((data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3]) >>> 0)!;
        }
        return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('PLTE', plte), ...(trns.some(a => a < 255) ? [chunk('tRNS', trns)] : []), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
    }
    ihdr[9] = 6;
    const raw = Buffer.alloc((w * 4 + 1) * h);
    for (let y = 0; y < h; y++)
        raw.set(data.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
export function extrude(src: RGBA, x: number, y: number): RGBA {
    const w = src.w + x * 2, h = src.h + y * 2, data = new Uint8Array(w * h * 4);
    for (let yy = 0; yy < h; yy++)
        for (let xx = 0; xx < w; xx++) {
            const p = (Math.max(0, Math.min(src.h - 1, yy - y)) * src.w + Math.max(0, Math.min(src.w - 1, xx - x))) * 4;
            data.set(src.data.subarray(p, p + 4), (yy * w + xx) * 4);
        }
    return { w, h, data };
}
