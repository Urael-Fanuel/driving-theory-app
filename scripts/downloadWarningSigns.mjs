/**
 * scripts/downloadWarningSigns.mjs
 * Downloads Israeli warning traffic signs (101–153) from Wikimedia Commons.
 *
 * Strategy:
 *   1. Query Wikimedia API for the direct SVG file URL (not thumbnail server)
 *   2. Download SVG
 *   3. Convert SVG → PNG using sharp
 *   4. Save as {number}.png in scripts/downloaded-signs/warning/
 *
 * Usage: node scripts/downloadWarningSigns.mjs
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
let sharp;
try {
  sharp = require('sharp');
} catch {
  // try global
  const globalModules = process.env.NODE_PATH || '';
  console.log('Trying to load sharp...');
  sharp = (await import('sharp')).default;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR   = join(__dirname, 'downloaded-signs', 'warning');
const PNG_SIZE  = 400; // px width & height for output PNG
const DELAY_MS  = 2000;

mkdirSync(OUT_DIR, { recursive: true });

// ─── Wikimedia Commons API — get DIRECT SVG url (not thumbnail server) ────────

async function getWikimediaSvgUrl(signNumber) {
  const filename = `Israel_road_sign_${signNumber}.svg`;
  const apiUrl   =
    `https://commons.wikimedia.org/w/api.php?` +
    `action=query&titles=File:${encodeURIComponent(filename)}` +
    `&prop=imageinfo&iiprop=url&format=json&origin=*`;

  const res  = await fetch(apiUrl, {
    headers: { 'User-Agent': 'DrivingTheoryApp/1.0 (educational; contact: admin@example.com)' }
  });
  const data = await res.json();
  const pages = Object.values(data.query?.pages ?? {});
  if (!pages.length || pages[0].missing !== undefined) return null;
  return pages[0]?.imageinfo?.[0]?.url ?? null;
}

async function downloadSvg(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'DrivingTheoryApp/1.0 (educational; contact: admin@example.com)' }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function svgToPng(svgBuf, destPath) {
  await sharp(svgBuf, { density: 300 })
    .resize(PNG_SIZE, PNG_SIZE, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toFile(destPath);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── Main ─────────────────────────────────────────────────────────────────────

const results = { ok: [], missing: [], failed: [] };

console.log(`Downloading warning signs 101–153 → ${OUT_DIR}\n`);

for (let num = 101; num <= 153; num++) {
  process.stdout.write(`  [${num}] `);

  try {
    const svgUrl = await getWikimediaSvgUrl(num);

    if (!svgUrl) {
      console.log('❌ NOT FOUND on Wikimedia');
      results.missing.push(num);
      await sleep(DELAY_MS);
      continue;
    }

    const svgBuf  = await downloadSvg(svgUrl);
    const destPath = join(OUT_DIR, `${num}.png`);
    await svgToPng(svgBuf, destPath);
    console.log(`✅ saved → ${num}.png`);
    results.ok.push(num);

  } catch (err) {
    console.log(`⚠️  ERROR: ${err.message}`);
    results.failed.push(num);
  }

  await sleep(DELAY_MS);
}

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════');
console.log(`✅ Downloaded:  ${results.ok.length}  signs → ${results.ok.join(', ')}`);
if (results.missing.length)
  console.log(`❌ Not on Wiki: ${results.missing.length} signs → ${results.missing.join(', ')}`);
if (results.failed.length)
  console.log(`⚠️  Errors:      ${results.failed.length} signs → ${results.failed.join(', ')}`);
console.log('══════════════════════════════════════');
console.log('\nCheck the downloaded images, then approve upload to Supabase.');
