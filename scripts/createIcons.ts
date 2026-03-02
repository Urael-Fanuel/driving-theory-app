/**
 * scripts/createIcons.ts
 *
 * Creates placeholder icon files required by app.json:
 *   assets/icons/app_icon.png     (1024×1024)
 *   assets/icons/splash.png       (1284×2778)
 *   assets/icons/adaptive-icon.png (1024×1024)
 *   assets/icons/favicon.png      (48×48)
 *
 * Run: npx tsx scripts/createIcons.ts
 */

import * as fs   from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

const ICONS_DIR = path.join(process.cwd(), 'assets', 'icons');

// App brand color — dark navy from app theme
const BG: [number, number, number] = [26, 26, 46];    // #1a1a2e
const FG: [number, number, number] = [78, 204, 163];  // #4ecca3 (accent green)

// ─── Minimal PNG builder (pure Node.js, no deps) ─────────────────────────────

function crc32(buf: Buffer): number {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crcBuf]);
}

function makePng(
  w: number, h: number,
  bgR: number, bgG: number, bgB: number,
  // Optional: draw a centered square in fg color (for icon visual)
  squareRatio = 0.5,
  fgR = bgR, fgG = bgG, fgB = bgB
): Buffer {
  // Build raw pixel data
  const rows: Buffer[] = [];
  const sq = Math.round(w * squareRatio);
  const sqX = Math.round((w - sq) / 2);
  const sqY = Math.round((h - sq) / 2);

  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 3);
    row[0] = 0; // filter type: None
    for (let x = 0; x < w; x++) {
      const inSquare = x >= sqX && x < sqX + sq && y >= sqY && y < sqY + sq;
      const [r, g, b] = inSquare ? [fgR, fgG, fgB] : [bgR, bgG, bgB];
      row[1 + x * 3]     = r;
      row[1 + x * 3 + 1] = g;
      row[1 + x * 3 + 2] = b;
    }
    rows.push(row);
  }

  const raw   = Buffer.concat(rows);
  const idat  = zlib.deflateSync(raw, { level: 6 });
  const ihdr  = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: RGB
  ihdr[10] = ihdr[11] = ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ─── Create icons ─────────────────────────────────────────────────────────────

if (!fs.existsSync(ICONS_DIR)) {
  fs.mkdirSync(ICONS_DIR, { recursive: true });
  console.log('📁  Created assets/icons/');
}

const icons: Array<{ file: string; w: number; h: number; desc: string }> = [
  { file: 'app_icon.png',      w: 1024, h: 1024, desc: 'App icon (1024×1024)' },
  { file: 'splash.png',        w: 1284, h: 2778, desc: 'Splash screen (1284×2778)' },
  { file: 'adaptive-icon.png', w: 1024, h: 1024, desc: 'Android adaptive icon (1024×1024)' },
  { file: 'favicon.png',       w:   48, h:   48, desc: 'Web favicon (48×48)' },
];

for (const icon of icons) {
  const outPath = path.join(ICONS_DIR, icon.file);
  const buf = makePng(icon.w, icon.h, BG[0], BG[1], BG[2], 0.4, FG[0], FG[1], FG[2]);
  fs.writeFileSync(outPath, buf);
  console.log(`  ✅  ${icon.desc}  →  ${(buf.length / 1024).toFixed(0)} KB`);
}

console.log('\n✅  All icon files created in assets/icons/');
console.log('   These are placeholder icons — replace with real artwork before publishing.\n');
