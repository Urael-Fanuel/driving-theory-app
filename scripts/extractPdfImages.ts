/**
 * scripts/extractPdfImages.ts
 *
 * Extracts real traffic sign images from the Israeli Ministry of Transportation PDF.
 *
 * PDF layout per page:
 *   Each row (RTL, left→right in PDF coords) = [legal text] | [Hebrew description] | [official number: 101, 202…] | [sign image]
 *
 * Algorithm:
 *   1. For each page: extract text items with (x, y) coordinates
 *   2. Find 3-digit sign numbers (101, 202…) → each defines one row
 *   3. Look up the official number in NUMBER_TO_FILENAME → exact, unambiguous assignment
 *   4. Render page at 2.5× scale → crop the image column (rightmost 30% of page)
 *   5. Save as correct assets/images/{image_filename}
 *
 * Prerequisites:
 *   npm install canvas pdfjs-dist@2.16.105
 *   (v2 is required — v3/v4 removed the legacy/build path used here)
 *
 * Run:
 *   npx tsx scripts/extractPdfImages.ts
 */

import * as fs   from 'fs';
import * as path from 'path';
import { createCanvas, Canvas } from 'canvas';

// ── NodeCanvasFactory ─────────────────────────────────────────────────────────
// pdfjs-dist v2 requires a CanvasFactory when rendering in Node.js.
// This provides the canvas implementation that the renderer writes pixels into.

interface CanvasAndContext {
  canvas: Canvas;
  context: ReturnType<Canvas['getContext']>;
}

class NodeCanvasFactory {
  create(width: number, height: number): CanvasAndContext {
    const canvas  = createCanvas(width, height);
    const context = canvas.getContext('2d');
    return { canvas, context };
  }

  reset(obj: CanvasAndContext, width: number, height: number): void {
    obj.canvas.width  = width;
    obj.canvas.height = height;
  }

  destroy(obj: CanvasAndContext): void {
    obj.canvas.width  = 0;
    obj.canvas.height = 0;
  }
}

// ── Config ────────────────────────────────────────────────────────────────────

const PDF_PATH   = path.join('C:/Users/Yakov/Downloads', 'State of Israel traffic sign board.pdf');
const OUT_DIR    = path.join(process.cwd(), 'assets', 'images');
const SCALE      = 2.5;          // render scale: higher = sharper output
const NUM_PADDING_PX = 30;       // (kept for reference — not used in fixed crop)
const MIN_ROW_HEIGHT_PX = 40;    // minimum row height at SCALE (prevents tiny crops)

// ── Official sign number → app image filename ────────────────────────────────
// Source: Israeli Traffic Regulations (תקנות התעבורה) official sign numbering.
// Each 3-digit number uniquely identifies one sign — no ambiguity possible.

const NUMBER_TO_FILENAME: Record<string, string> = {
  // Regulatory signs (100-series)
  '101': 'sign_stop.png',
  '103': 'sign_yield.png',
  '108': 'sign_no_entry.png',
  '109': 'sign_speed_30.png',
  '110': 'sign_speed_50.png',
  '112': 'sign_speed_90.png',
  '114': 'sign_road_closed.png',
  '115': 'sign_no_trucks.png',
  '116': 'sign_no_bicycles.png',
  '121': 'sign_no_overtaking.png',
  '122': 'sign_no_uturn.png',
  '125': 'sign_one_way.png',
  '126': 'sign_compulsory_stop.png',
  '127': 'sign_no_parking.png',
  '133': 'sign_weight_limit.png',
  // Warning signs (200-series)
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
  // Information signs (300-series)
  '301': 'sign_parking.png',
  '304': 'sign_bus_stop.png',
  '305': 'sign_taxi.png',
  '309': 'sign_hospital.png',
  '310': 'sign_first_aid.png',
  '315': 'sign_gas_station.png',
  '320': 'sign_roundabout.png',
  '330': 'sign_highway_start.png',
  '331': 'sign_highway_end.png',
  // Road markings (400-series)
  '401': 'mark_solid_white.png',
  '402': 'mark_dashed_white.png',
  '403': 'mark_double_yellow.png',
  '410': 'mark_stop_line.png',
  '411': 'mark_crosswalk.png',
  '420': 'mark_arrow_straight.png',
  '421': 'mark_arrow_turn.png',
  '430': 'mark_no_parking_zone.png',
  // Right of way signs (500-series)
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

interface TextItem {
  str:  string;
  tx:   number;  // x in PDF units (from left)
  ty:   number;  // y in PDF units (from bottom — pdfjs convention)
}

interface SignRow {
  signNumber: string;  // e.g. "101"
  tx:         number;  // x position of number text in PDF units
  ty:         number;  // y position of number text in PDF units
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // ── Load pdfjs-dist (dynamic require to avoid TSC module issues) ────────────
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
  (pdfjsLib as { GlobalWorkerOptions: { workerSrc: string | boolean } })
    .GlobalWorkerOptions.workerSrc = false;

  console.log('🗺️  Israeli Traffic Sign Extractor');
  console.log('─'.repeat(60));
  console.log(`📋 Target signs: ${Object.keys(NUMBER_TO_FILENAME).length} (using official sign numbers)\n`);

  // Ensure output directory
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  // ── Load PDF ────────────────────────────────────────────────────────────────
  if (!fs.existsSync(PDF_PATH)) {
    console.error(`❌ PDF not found: ${PDF_PATH}`);
    process.exit(1);
  }
  const pdfData = new Uint8Array(fs.readFileSync(PDF_PATH));
  const pdfDoc  = await pdfjsLib.getDocument({ data: pdfData }).promise;
  const numPages = pdfDoc.numPages;
  console.log(`📄 PDF loaded: ${numPages} pages\n`);

  // ── Track results ───────────────────────────────────────────────────────────
  const matched   = new Map<string, string>(); // signNumber → filename saved
  const unmatched: string[] = [];              // signNumbers saved as REVIEW_*
  const extracted = new Set<string>();         // image_filenames already saved

  // ── Process each page ───────────────────────────────────────────────────────
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page     = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: SCALE });

    // ── Step 1: Extract text items with coordinates ──────────────────────────
    const textContent = await page.getTextContent();
    const items: TextItem[] = (textContent.items as Array<{
      str: string;
      transform: number[];
    }>).map(item => ({
      str: item.str,
      tx:  item.transform[4],   // translateX
      ty:  item.transform[5],   // translateY (from bottom of page)
    }));

    // ── Step 2: Find sign number rows ────────────────────────────────────────
    // All 3-digit candidates — includes regulation references in description text.
    const allThreeDigit = items.filter(item => /^\d{3}$/.test(item.str.trim()));
    if (allThreeDigit.length === 0) continue;

    // KEY INSIGHT: In this Hebrew RTL PDF, sign images are on the RIGHT edge of the page.
    // Sign numbers appear just LEFT of the sign image = also at HIGH x values (right side).
    // Regulation/footnote references in the description text are at LOW x values (left side).
    //
    // Strategy: only consider 3-digit numbers in the RIGHT 55% of the page.
    // This filters out left-side regulation numbers, keeping only sign number candidates.
    const pageWidthPDF = viewport.width / SCALE;
    const rightThreshold = pageWidthPDF * 0.45; // right 55% of page
    const rightItems = allThreeDigit.filter(item => item.tx >= rightThreshold);
    // Fall back to all items only if no right-side candidates found
    const candidates = rightItems.length >= 2 ? rightItems : allThreeDigit;

    // Cluster by x-position (±15 PDF units tolerance).
    // Real sign numbers (101, 202…) appear in ONE consistent x-column per page.
    const xClusters = new Map<number, typeof candidates>();
    for (const item of candidates) {
      let placed = false;
      for (const [cx] of xClusters) {
        if (Math.abs(item.tx - cx) <= 15) {
          xClusters.get(cx)!.push(item);
          placed = true;
          break;
        }
      }
      if (!placed) xClusters.set(item.tx, [item]);
    }

    // Sign numbers appear CLOSEST to the sign image = RIGHTMOST consistent column.
    // Pick the rightmost cluster that has ≥2 items (consistent column, not a stray number).
    let signColX = -1;
    let bestCount = 0;
    for (const [cx, group] of xClusters) {
      if (group.length >= 2 && cx > signColX) {
        signColX = cx;
        bestCount = group.length;
      }
    }
    // Fall back to dominant cluster if no cluster has ≥2 items
    if (signColX === -1) {
      for (const [cx, group] of xClusters) {
        if (group.length > bestCount) { bestCount = group.length; signColX = cx; }
      }
    }

    // Use only numbers from the rightmost column; fall back to all candidates if unclear
    const signNumberItems = signColX >= 0
      ? candidates.filter(item => Math.abs(item.tx - signColX) <= 15)
      : candidates;

    if (signNumberItems.length === 0) continue;

    // Estimate row height from median Y-spacing between consecutive numbers
    const sortedByY = [...signNumberItems].sort((a, b) => b.ty - a.ty); // top→bottom in page
    let rowHeightPDF = 55; // fallback in PDF units (increased for pages with 1 sign)
    if (sortedByY.length > 1) {
      const spacings = sortedByY
        .slice(1)
        .map((r, i) => Math.abs(sortedByY[i].ty - r.ty))
        .filter(s => s > 2);
      spacings.sort((a, b) => a - b);
      if (spacings.length > 0) {
        rowHeightPDF = spacings[Math.floor(spacings.length / 2)];
      }
    }

    // Build rows (no rowText needed — we use official numbers directly)
    const signRows: SignRow[] = signNumberItems.map(numItem => ({
      signNumber: numItem.str.trim(),
      tx:         numItem.tx,
      ty:         numItem.ty,
    }));

    // ── Step 3: Render page to canvas ────────────────────────────────────────
    // pdfjs-dist v2 in Node.js requires a canvasFactory (not just a raw context)
    const canvasFactory  = new NodeCanvasFactory();
    const { canvas: pageCanvas, context: ctx } = canvasFactory.create(viewport.width, viewport.height);
    await page.render({
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport,
      canvasFactory: canvasFactory as unknown as import('pdfjs-dist').CanvasFactory,
    }).promise;

    // ── Step 4 + 5: Crop each sign row and save with official number filename ─
    const pageResults: string[] = [];

    for (const row of signRows) {
      // ── Step 5: Assign filename via official sign number ───────────────────
      const targetFilename = NUMBER_TO_FILENAME[row.signNumber];
      const outFilename = targetFilename ?? `REVIEW_sign_${row.signNumber}.png`;
      const outPath = path.join(OUT_DIR, outFilename);

      // Convert PDF coords → canvas pixels
      // pdfjs: ty is distance from page BOTTOM in PDF units
      // canvas: y is distance from page TOP in pixels
      const centerY_px = viewport.height - row.ty * SCALE;
      const rowH_px    = Math.max(rowHeightPDF * SCALE, MIN_ROW_HEIGHT_PX);
      const top_px     = Math.round(centerY_px - rowH_px / 2);

      // FIXED CROP: take the rightmost 40% of the page width.
      // 60% start captures sign number column + sign image (wider than 70% to handle
      // signs whose images are positioned slightly further left on some pages).
      const cropStartX_px = Math.round(viewport.width * 0.60);
      const cropW_px      = Math.round(viewport.width) - cropStartX_px;
      const cropH_px      = Math.round(rowH_px);

      // Sanity check: skip if crop would be invalid
      if (
        cropW_px <= 10 ||
        cropH_px <= 10 ||
        top_px < 0 ||
        top_px + cropH_px > viewport.height
      ) {
        pageResults.push(`  ⚠️  ${row.signNumber} — invalid crop bounds, skipping`);
        continue;
      }

      // Crop using a second canvas (right side of page = sign image column)
      const cropCanvas = createCanvas(cropW_px, cropH_px);
      const cropCtx    = cropCanvas.getContext('2d');
      cropCtx.drawImage(
        pageCanvas as unknown as HTMLCanvasElement,
        cropStartX_px, top_px, cropW_px, cropH_px,   // source: right side of page
        0, 0,         cropW_px, cropH_px              // destination
      );

      // BEST-SIZE-WINS: only overwrite if new crop is larger than existing file.
      // Introductory/overview pages show small thumbnails; detail pages show full-size.
      // By keeping the largest crop we always end up with the best quality image.
      const newBuffer     = cropCanvas.toBuffer('image/png');
      const existingSize  = fs.existsSync(outPath) ? fs.statSync(outPath).size : 0;

      if (newBuffer.length <= existingSize) {
        pageResults.push(`  ⏭  ${row.signNumber} → ${outFilename} (existing ${existingSize}B ≥ new ${newBuffer.length}B)`);
        continue;
      }

      fs.writeFileSync(outPath, newBuffer);

      if (targetFilename) {
        extracted.add(targetFilename);
        matched.set(row.signNumber, outFilename);
        pageResults.push(`  ✅ ${row.signNumber} → ${outFilename} (${newBuffer.length}B)`);
      } else {
        if (!unmatched.includes(row.signNumber)) unmatched.push(row.signNumber);
        pageResults.push(`  📋 ${row.signNumber} → ${outFilename}  (unknown sign number)`);
      }
    }

    if (pageResults.length > 0) {
      console.log(`📄 Page ${pageNum} — ${signRows.length} sign row(s):`);
      pageResults.forEach(r => console.log(r));
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(60));
  console.log('✅ Extraction complete!\n');
  console.log(`   Matched:   ${matched.size}  signs  (saved with correct filename)`);
  console.log(`   Review:    ${unmatched.length}  signs  (saved as REVIEW_sign_NNN.png — unknown numbers)`);

  // ── Report which app signs were NOT found in PDF ─────────────────────────────
  const allTargetFilenames = Object.values(NUMBER_TO_FILENAME);
  const notFound = allTargetFilenames.filter(f => !extracted.has(f));
  if (notFound.length > 0) {
    console.log(`\n⚠️  App signs not found in PDF (${notFound.length}):`);
    notFound.forEach(f => {
      const num = Object.entries(NUMBER_TO_FILENAME).find(([, v]) => v === f)?.[0] ?? '???';
      console.log(`   [${num}] ${f}  — placeholder remains`);
    });
  }

  console.log('\n⏭  Safety signs (not official road signs — placeholders remain):');
  console.log('   safety_*.png  →  Replace manually with real artwork if needed.');

  console.log('\n🎯 Next steps:');
  console.log('   1. Review any REVIEW_sign_NNN.png files if needed');
  console.log('   2. npx tsx backend/uploadContent.ts');
  console.log('─'.repeat(60));
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
