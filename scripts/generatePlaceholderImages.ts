#!/usr/bin/env node
/**
 * scripts/generatePlaceholderImages.ts
 *
 * Creates solid-color placeholder PNG images so the app can run for testing.
 * Replace with real Israeli traffic sign images before going to production.
 *
 * Sign images:  300×300px, colored by topic category
 * Answer images: 200×200px, neutral gray
 *
 * Uses ONLY Node.js built-ins — no npm packages required.
 * Run: npx tsx scripts/generatePlaceholderImages.ts
 */

import fs   from 'fs';
import path from 'path';
import zlib from 'zlib';

// ── Paths ──────────────────────────────────────────────────────────────────────

const ROOT     = path.join(__dirname, '..');
const OUT_DIR  = path.join(ROOT, 'assets', 'images');
const SIGNS_FILE = path.join(ROOT, 'content', 'signs.json');

// ── CRC-32 (required by PNG spec) ─────────────────────────────────────────────

function makeCrcTable(): number[] {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c;
  }
  return table;
}
const CRC_TABLE = makeCrcTable();

function crc32(buf: Buffer): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = (CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ── PNG builder ────────────────────────────────────────────────────────────────

function chunk(type: string, data: Buffer): Buffer {
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf  = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function makePng(w: number, h: number, r: number, g: number, b: number): Buffer {
  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR: 13 bytes
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8]  = 8; // bit depth
  ihdr[9]  = 2; // color type: RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Raw pixel data: filter byte (0 = None) + RGB per row
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    const row = y * (1 + w * 3);
    raw[row] = 0; // filter type None
    for (let x = 0; x < w; x++) {
      const px = row + 1 + x * 3;
      raw[px]     = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
    }
  }

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Color scheme per topic ─────────────────────────────────────────────────────

const TOPIC_COLORS: Record<string, [number, number, number]> = {
  regulatory:   [220, 50,  50],   // red
  warning:      [240, 175, 0],    // yellow/amber
  information:  [30,  120, 220],  // blue
  road_markings:[130, 130, 130],  // gray
  right_of_way: [160, 60,  220],  // purple
  safety:       [40,  180, 80],   // green
};

const ANSWER_COLOR: [number, number, number] = [190, 200, 215]; // steel blue-gray

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  // Read signs.json
  const raw   = fs.readFileSync(SIGNS_FILE, 'utf-8').replace(/^\uFEFF/, '');
  const signs = JSON.parse(raw) as Array<{
    id:             string;
    topic_id:       string;
    image_filename: string;
    questions:      Array<{
      answers: Array<{ image?: string }>;
    }>;
  }>;

  // Ensure output directory
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  let signsDone  = 0;
  let answersDone = 0;
  const answerFilenames = new Set<string>();

  // ── Sign images ──────────────────────────────────────────────────────────────
  for (const sign of signs) {
    const [r, g, b] = TOPIC_COLORS[sign.topic_id] ?? [128, 128, 128];
    const dest = path.join(OUT_DIR, sign.image_filename);

    if (!fs.existsSync(dest)) {
      fs.writeFileSync(dest, makePng(300, 300, r, g, b));
      signsDone++;
      process.stdout.write(`  [sign] ${sign.image_filename}\n`);
    }

    // Collect all answer image names
    for (const q of sign.questions) {
      for (const a of q.answers) {
        if (a.image) answerFilenames.add(a.image);
      }
    }
  }

  // ── Answer images ────────────────────────────────────────────────────────────
  const [ar, ag, ab] = ANSWER_COLOR;
  for (const filename of [...answerFilenames].sort()) {
    const dest = path.join(OUT_DIR, filename);
    if (!fs.existsSync(dest)) {
      fs.writeFileSync(dest, makePng(200, 200, ar, ag, ab));
      answersDone++;
    }
  }

  console.log(`\n✅ Sign images created:   ${signsDone}  (300×300px, colored by topic)`);
  console.log(`✅ Answer images created: ${answersDone}  (200×200px, neutral gray-blue)`);
  console.log(`✅ Total:                 ${signsDone + answersDone} files`);
  console.log(`📁 Output: assets/images/\n`);
  console.log('⚠️  These are PLACEHOLDER images for development/testing.');
  console.log('   Replace with real Israeli traffic sign images before production.\n');
}

main();
