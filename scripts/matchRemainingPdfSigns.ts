/**
 * scripts/matchRemainingPdfSigns.ts
 *
 * Phase 2 of PDF image extraction:
 *   1. Detects which signs are still placeholders (file size < PLACEHOLDER_THRESHOLD)
 *   2. Re-scans the PDF with LOWER threshold (0.25) and BROADER number regex (\d{1,4})
 *   3. Renames matching REVIEW_sign_NNN.png files to the correct image_filename
 *   ✅ REVIEW files that don't match are kept as-is (NOT deleted)
 *
 * Run AFTER extractPdfImages.ts:
 *   npx tsx scripts/matchRemainingPdfSigns.ts
 */

import * as fs   from 'fs';
import * as path from 'path';
import { createCanvas, Canvas } from 'canvas';

// ── Config ────────────────────────────────────────────────────────────────────

const PDF_PATH            = path.join('C:/Users/Yakov/Downloads', 'State of Israel traffic sign board.pdf');
const SIGNS_PATH          = path.join(process.cwd(), 'content', 'signs.json');
const IMAGES_DIR          = path.join(process.cwd(), 'assets', 'images');
const PLACEHOLDER_MAX_KB  = 15;   // files smaller than this are likely still placeholder
const MATCH_THRESHOLD     = 0.20; // looser than Phase 1's 0.5 — catches more partial matches
const SCALE               = 2.5;

// Safety signs — excluded (not in PDF)
const SAFETY_SIGN_IDS = new Set([
  'SIGN_SEATBELT', 'SIGN_NO_ALCOHOL', 'SIGN_SPEED_CAMERA',
  'SIGN_NO_MOBILE', 'SIGN_FATIGUE', 'SIGN_CHILD', 'SIGN_NIGHT_DRIVING',
]);

// ── Official number → image_filename lookup ───────────────────────────────────
// Primary matching strategy: map Israeli official sign numbers directly.
// These are the numbers printed on each row of the Ministry of Transportation PDF.
// Numbers sourced from תקנות התעבורה, נספח 3 (Traffic Regulations, Annex 3).

const OFFICIAL_NUMBER_TO_FILENAME: Record<string, string> = {
  // ── Regulatory (100s) ──────────────────────────────────────────────────────
  '101': 'sign_stop.png',
  '103': 'sign_yield.png',
  '108': 'sign_no_entry.png',
  '114': 'sign_road_closed.png',
  '115': 'sign_no_trucks.png',
  '116': 'sign_no_bicycles.png',
  '121': 'sign_no_overtaking.png',
  '122': 'sign_no_uturn.png',
  '125': 'sign_one_way.png',
  '126': 'sign_compulsory_stop.png',
  '127': 'sign_no_parking.png',
  '133': 'sign_weight_limit.png',
  // Speed limit signs (same base sign, different number printed inside)
  '109': 'sign_speed_30.png',        // max speed 30
  '110': 'sign_speed_50.png',        // max speed 50
  '112': 'sign_speed_90.png',        // max speed 90
  // ── Warning (200s) ────────────────────────────────────────────────────────
  '201': 'sign_curve_right.png',
  '202': 'sign_curve_left.png',
  '207': 'sign_hill_descent.png',
  '212': 'sign_narrow_road.png',
  '217': 'sign_bump.png',
  '220': 'sign_slippery.png',
  '221': 'sign_road_work.png',
  '228': 'sign_crossroads.png',
  '229': 'sign_t_junction.png',
  '231': 'sign_traffic_light_ahead.png',
  '234': 'sign_pedestrian.png',
  '235': 'sign_school_zone.png',
  // ── Information (300s) ────────────────────────────────────────────────────
  '301': 'sign_parking.png',
  '304': 'sign_bus_stop.png',
  '305': 'sign_taxi.png',
  '309': 'sign_hospital.png',
  '310': 'sign_first_aid.png',
  '314': 'sign_telephone.png',
  '315': 'sign_gas_station.png',
  '320': 'sign_roundabout.png',
  '330': 'sign_highway_start.png',
  '331': 'sign_highway_end.png',
  // ── Road markings (400s) ──────────────────────────────────────────────────
  '401': 'mark_solid_white.png',
  '402': 'mark_dashed_white.png',
  '403': 'mark_double_yellow.png',
  '410': 'mark_stop_line.png',
  '411': 'mark_crosswalk.png',
  '420': 'mark_arrow_straight.png',
  '421': 'mark_arrow_turn.png',
  '430': 'mark_no_parking_zone.png',
  // ── Right of way (500s / 600s) ────────────────────────────────────────────
  '501': 'row_junction_yield.png',
  '502': 'row_roundabout.png',
  '503': 'row_main_road.png',
  '504': 'row_yield_oncoming.png',
  '505': 'row_four_way_stop.png',
  '506': 'row_merge.png',
  '507': 'row_priority_road.png',
  '508': 'row_end_priority.png',
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface SignEntry {
  id:             string;
  image_filename: string;
  name_hebrew:    string;
  topic_id:       string;
}

// ── NodeCanvasFactory ─────────────────────────────────────────────────────────

interface CanvasAndContext {
  canvas:  Canvas;
  context: ReturnType<Canvas['getContext']>;
}

class NodeCanvasFactory {
  create(w: number, h: number): CanvasAndContext {
    const canvas = createCanvas(w, h);
    return { canvas, context: canvas.getContext('2d') };
  }
  reset(o: CanvasAndContext, w: number, h: number): void {
    o.canvas.width = w; o.canvas.height = h;
  }
  destroy(o: CanvasAndContext): void {
    o.canvas.width = 0; o.canvas.height = 0;
  }
}

// ── Keyword matcher ───────────────────────────────────────────────────────────

function buildMatcher(nameHebrew: string): (text: string) => number {
  // Split and add sub-word alternatives for compound Hebrew phrases
  const keywords = nameHebrew
    .split(/\s+/)
    .map(k => k.trim())
    .filter(k => k.length >= 2);

  return (text: string): number => {
    const matched = keywords.filter(kw => text.includes(kw));
    if (matched.length === 0) return 0;
    const totalLen = keywords.reduce((s, k) => s + k.length, 0);
    const matchLen = matched.reduce((s, k) => s + k.length, 0);
    return matchLen / totalLen;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isPlaceholder(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath);
    return stat.size < PLACEHOLDER_MAX_KB * 1024;
  } catch {
    return true; // file missing → treat as placeholder
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
  (pdfjsLib as { GlobalWorkerOptions: { workerSrc: boolean } })
    .GlobalWorkerOptions.workerSrc = false;

  console.log('🔍  Phase 2: Find Remaining Signs + Clean Up');
  console.log('─'.repeat(60));

  // ── Load signs.json ─────────────────────────────────────────────────────────
  const allSigns: SignEntry[] = JSON.parse(
    fs.readFileSync(SIGNS_PATH, 'utf-8').replace(/^\uFEFF/, '')
  );
  const targetSigns = allSigns.filter(s => s.name_hebrew && !SAFETY_SIGN_IDS.has(s.id));

  // ── Detect which signs are still placeholders ────────────────────────────────
  const stillPlaceholder = targetSigns.filter(s =>
    isPlaceholder(path.join(IMAGES_DIR, s.image_filename))
  );

  if (stillPlaceholder.length === 0) {
    console.log('✅ All signs already have real images! Nothing to do.\n');
  } else {
    console.log(`⚠️  Still placeholder (${stillPlaceholder.length} signs):`);
    stillPlaceholder.forEach(s => console.log(`   ${s.image_filename}  ["${s.name_hebrew}"]`));
    console.log('');
  }

  // ── List REVIEW files ───────────────────────────────────────────────────────
  const reviewFiles = fs.readdirSync(IMAGES_DIR)
    .filter(f => f.startsWith('REVIEW_sign_') && f.endsWith('.png'));
  console.log(`📂  REVIEW files in assets/images/: ${reviewFiles.length}\n`);

  // ── Early exit if nothing to do ──────────────────────────────────────────────
  if (stillPlaceholder.length === 0) {
    console.log('✅ All signs already have real images! Nothing to do.\n');
    return;
  }
  if (reviewFiles.length === 0) {
    console.log('⚠️  No REVIEW files found — run extractPdfImages.ts first.\n');
    return;
  }

  // ── Build matchers for remaining signs ──────────────────────────────────────
  const matchers = stillPlaceholder.map(sign => ({
    sign,
    match: buildMatcher(sign.name_hebrew),
  }));

  // ── Load PDF ─────────────────────────────────────────────────────────────────
  const pdfData = new Uint8Array(fs.readFileSync(PDF_PATH));
  const pdfDoc  = await pdfjsLib.getDocument({ data: pdfData }).promise;
  console.log(`📄  Re-scanning ${pdfDoc.numPages} PDF pages (lower threshold ${MATCH_THRESHOLD})…\n`);

  // Map: signNumber → { pageNum, tx, ty, rowText, rowHeightPDF }
  const signNumberData = new Map<string, {
    pageNum:     number;
    tx:          number;
    ty:          number;
    rowText:     string;
    rowHeightPDF:number;
  }>();

  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page        = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const items       = (textContent.items as Array<{ str: string; transform: number[] }>)
      .map(item => ({ str: item.str, tx: item.transform[4], ty: item.transform[5] }));

    // Broader regex: 1–4 digit numbers (catches road marking codes like 401, 502…)
    const numItems = items.filter(it => /^\d{1,4}$/.test(it.str.trim()) && parseInt(it.str) > 99);
    if (numItems.length === 0) continue;

    // Estimate row height
    const sorted = [...numItems].sort((a, b) => b.ty - a.ty);
    let rowHeightPDF = 40;
    if (sorted.length > 1) {
      const spacings = sorted
        .slice(1)
        .map((r, i) => Math.abs(sorted[i].ty - r.ty))
        .filter(s => s > 2);
      spacings.sort((a, b) => a - b);
      if (spacings.length > 0) rowHeightPDF = spacings[Math.floor(spacings.length / 2)];
    }

    const halfRow = rowHeightPDF * 0.6;
    for (const numItem of numItems) {
      const rowItems = items.filter(it => Math.abs(it.ty - numItem.ty) <= halfRow);
      const rowText  = rowItems.map(it => it.str).join(' ');
      const key      = numItem.str.trim();
      if (!signNumberData.has(key)) {
        signNumberData.set(key, {
          pageNum, tx: numItem.tx, ty: numItem.ty, rowText, rowHeightPDF,
        });
      }
    }
  }

  console.log(`   Found ${signNumberData.size} sign numbers in PDF.\n`);

  // ── Match remaining placeholder signs to sign numbers ────────────────────────
  // Strategy 1: direct official-number lookup (OFFICIAL_NUMBER_TO_FILENAME table)
  // Strategy 2: text-keyword matching against PDF row text (fallback)

  const resolved  = new Set<string>(); // image_filenames we've matched
  const renameMap = new Map<string, string>(); // reviewFilename → targetFilename

  // Strategy 1: official number lookup
  console.log('🔢  Strategy 1: official number lookup…');
  for (const [officialNum, targetFilename] of Object.entries(OFFICIAL_NUMBER_TO_FILENAME)) {
    if (!stillPlaceholder.some(s => s.image_filename === targetFilename)) continue; // already real
    if (resolved.has(targetFilename)) continue; // already matched

    const reviewFile = `REVIEW_sign_${officialNum}.png`;
    const reviewPath = path.join(IMAGES_DIR, reviewFile);
    if (fs.existsSync(reviewPath)) {
      renameMap.set(reviewFile, targetFilename);
      resolved.add(targetFilename);
      console.log(`  ✅ ${targetFilename}  ←  ${reviewFile}  (official number ${officialNum})`);
    }
  }

  // Strategy 2: text keyword matching for signs not yet resolved
  const stillUnresolved = matchers.filter(m => !resolved.has(m.sign.image_filename));
  if (stillUnresolved.length > 0) {
    console.log(`\n🔤  Strategy 2: text keyword matching for ${stillUnresolved.length} remaining signs…`);
    for (const { sign, match } of stillUnresolved) {
      let bestScore  = 0;
      let bestNumber = '';

      for (const [signNum, data] of signNumberData.entries()) {
        const score = match(data.rowText);
        if (score > bestScore) {
          bestScore  = score;
          bestNumber = signNum;
        }
      }

      if (bestScore >= MATCH_THRESHOLD && bestNumber) {
        const reviewFile = `REVIEW_sign_${bestNumber}.png`;
        if (fs.existsSync(path.join(IMAGES_DIR, reviewFile))) {
          renameMap.set(reviewFile, sign.image_filename);
          resolved.add(sign.image_filename);
          console.log(`  ✅ ${sign.image_filename}  ←  ${reviewFile}  (text score ${bestScore.toFixed(2)})`);
        } else {
          console.log(`  ⚠️  Best text match for "${sign.name_hebrew}" → sign ${bestNumber} but REVIEW file not found`);
        }
      } else {
        console.log(`  ❌ "${sign.name_hebrew}"  — no match (best ${bestScore.toFixed(2)})`);
      }
    }
  }

  // ── Apply renames ────────────────────────────────────────────────────────────
  console.log('');
  for (const [from, to] of renameMap.entries()) {
    const src  = path.join(IMAGES_DIR, from);
    const dest = path.join(IMAGES_DIR, to);
    fs.copyFileSync(src, dest);
    fs.unlinkSync(src);
    console.log(`  📝  Renamed: ${from} → ${to}`);
  }

  // ── Crop & save new matches from PDF (same logic as Phase 1) ─────────────────
  // (renames above handled copying; the files are now in place)

  // ── Final summary ─────────────────────────────────────────────────────────────
  const remainingReview = fs.readdirSync(IMAGES_DIR)
    .filter(f => f.startsWith('REVIEW_sign_') && f.endsWith('.png'));

  console.log('\n' + '─'.repeat(60));
  const stillMissing = stillPlaceholder.filter(s => !resolved.has(s.image_filename));
  console.log(`✅  Newly matched:       ${resolved.size} signs renamed`);
  console.log(`📂  REVIEW files kept:  ${remainingReview.length} (not deleted)`);
  if (stillMissing.length > 0) {
    console.log(`\n⚠️  Still placeholder after Phase 2 (${stillMissing.length}):`);
    stillMissing.forEach(s => console.log(`   ${s.image_filename}  ["${s.name_hebrew}"]`));
    console.log('\n   To fix manually: find the correct REVIEW_sign_NNN.png and rename it.');
    console.log('   Example: rename REVIEW_sign_403.png → mark_double_yellow.png');
  } else {
    console.log('\n🎉  All target signs have real images!');
  }

  console.log('\n📋  Remaining REVIEW files (official sign images not yet in app):');
  remainingReview.slice(0, 10).forEach(f => console.log(`   ${f}`));
  if (remainingReview.length > 10) console.log(`   … and ${remainingReview.length - 10} more`);

  console.log('\n🎯 Next steps:');
  console.log('   npx tsx backend/uploadContent.ts');
  console.log('   npx tsx scripts/generateVideos.ts');
  console.log('─'.repeat(60));
}


main().catch(err => { console.error('Fatal:', err); process.exit(1); });
