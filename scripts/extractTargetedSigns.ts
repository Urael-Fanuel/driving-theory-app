/**
 * scripts/extractTargetedSigns.ts
 *
 * Directly extracts specific sign images from the correct PDF pages,
 * bypassing the deduplication issues of earlier scripts.
 *
 * Fixes:
 *   sign_roundabout.png    ← page 9,  sign 121 (מעגל תנועה)
 *   sign_highway_start.png ← page 20, sign 216 (כניסה לדרך מהירה)
 *
 * Note: sign_telephone.png is NOT in this PDF edition — stays as placeholder.
 *
 * Run: npx tsx scripts/extractTargetedSigns.ts
 */

import * as fs   from 'fs';
import * as path from 'path';
import { createCanvas, Canvas } from 'canvas';

const PDF_PATH   = path.join('C:/Users/Yakov/Downloads', 'State of Israel traffic sign board.pdf');
const IMAGES_DIR = path.join(process.cwd(), 'assets', 'images');
const SCALE      = 2.5;
const NUM_PADDING_PX = 8; // pixels to trim on right edge of crop (exclude number column gap)

// Signs to extract: [ pageNum, signNumber, outputFilename ]
const TARGETS = [
  { page: 9,  signNum: '121', outFile: 'sign_roundabout.png',    label: 'מעגל תנועה (roundabout)' },
  { page: 20, signNum: '216', outFile: 'sign_highway_start.png', label: 'כניסה לדרך מהירה (highway start)' },
];

interface CanvasCtx { canvas: Canvas; context: ReturnType<Canvas['getContext']> }
class NodeCanvasFactory {
  create(w: number, h: number): CanvasCtx { const c = createCanvas(w, h); return { canvas: c, context: c.getContext('2d') }; }
  reset(o: CanvasCtx, w: number, h: number) { o.canvas.width = w; o.canvas.height = h; }
  destroy(o: CanvasCtx) { o.canvas.width = 0; o.canvas.height = 0; }
}

async function main(): Promise<void> {
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
  (pdfjsLib as any).GlobalWorkerOptions.workerSrc = false;

  const pdfData = new Uint8Array(fs.readFileSync(PDF_PATH));
  const pdfDoc  = await pdfjsLib.getDocument({ data: pdfData }).promise;
  const factory = new NodeCanvasFactory();

  let successCount = 0;

  for (const target of TARGETS) {
    console.log(`\n🎯  Extracting: ${target.outFile}  [${target.label}]`);
    console.log(`    Page ${target.page}, sign number ${target.signNum}`);

    const page        = await pdfDoc.getPage(target.page);
    const textContent = await page.getTextContent();
    const items = (textContent.items as Array<{ str: string; transform: number[] }>)
      .map(it => ({ str: it.str.trim(), tx: it.transform[4], ty: it.transform[5] }))
      .filter(it => it.str.length > 0);

    // Find the specific sign number item on this page
    const numItems = items.filter(it =>
      it.str === target.signNum ||
      (it.str.replace(/[^0-9]/g, '') === target.signNum && it.str.length <= target.signNum.length + 2)
    );

    if (numItems.length === 0) {
      console.log(`    ❌  Sign number ${target.signNum} not found as text on page ${target.page}`);
      console.log(`       Trying broader search…`);

      // Broader: look for any text item containing the sign number
      const broader = items.filter(it => it.str.includes(target.signNum));
      if (broader.length === 0) {
        console.log(`    ❌  Still not found. Skipping.`);
        continue;
      }
      console.log(`    Found ${broader.length} broader matches:`);
      broader.forEach(it => console.log(`       "${it.str}" at (${it.tx.toFixed(0)}, ${it.ty.toFixed(0)})`));
    }

    // Pick the item with the best position (furthest left = in number column)
    // Signs are in the LEFT portion of the page; the number column is near the sign image
    // Use the one closest to the left side with reasonable Y position
    const allMatches = numItems.length > 0 ? numItems :
      items.filter(it => it.str.includes(target.signNum));

    // Find the number item that is on the main content area (not footnote)
    // Main content area: y > 100 (PDF units from bottom), reasonable x position
    const contentItems = allMatches.filter(it => it.ty > 80 && it.tx > 0);
    const chosen = contentItems.length > 0 ? contentItems[0] : allMatches[0];

    console.log(`    Using sign number at (tx=${chosen.tx.toFixed(1)}, ty=${chosen.ty.toFixed(1)})`);

    // Estimate row height from adjacent sign numbers on same page
    const allSignNums = items.filter(it => /^\d{3}$/.test(it.str) && parseInt(it.str) >= 100);
    let rowHeightPDF = 40;
    if (allSignNums.length > 1) {
      const sorted = [...allSignNums].sort((a, b) => b.ty - a.ty);
      const spacings = sorted.slice(1)
        .map((r, i) => Math.abs(sorted[i].ty - r.ty))
        .filter(s => s > 5)
        .sort((a, b) => a - b);
      if (spacings.length > 0) {
        rowHeightPDF = spacings[Math.floor(spacings.length / 2)];
        console.log(`    Row height: ${rowHeightPDF.toFixed(1)} PDF units`);
      }
    }

    // Render page
    const viewport = page.getViewport({ scale: SCALE });
    const { canvas: pageCanvas, context: ctx } = factory.create(
      Math.round(viewport.width), Math.round(viewport.height)
    );
    await page.render({
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport,
      canvasFactory: factory as unknown as import('pdfjs-dist').CanvasFactory,
    }).promise;

    // Calculate crop area
    // pdfjs Y=0 at bottom → canvas Y=0 at top
    const centerY_px = viewport.height - chosen.ty * SCALE;
    const cropTop    = Math.max(0, Math.round(centerY_px - rowHeightPDF * SCALE * 0.55));
    const cropBot    = Math.min(viewport.height, Math.round(centerY_px + rowHeightPDF * SCALE * 0.55));
    const cropH      = cropBot - cropTop;

    // In Hebrew/RTL PDFs the sign IMAGE column is on the RIGHT side of the page.
    // The sign number (tx) is to the LEFT of the sign image.
    // So we crop from (tx * SCALE + padding) to page right edge.
    const signImgLeft = Math.round(chosen.tx * SCALE + NUM_PADDING_PX);
    const cropW       = Math.max(50, Math.round(viewport.width) - signImgLeft);

    console.log(`    Crop: x=${signImgLeft}..${signImgLeft + cropW}  y=${cropTop}..${cropBot}  (${cropW}×${cropH}px)`);

    if (cropW < 30 || cropH < 30) {
      console.log(`    ⚠️  Crop too small — sign number may be in wrong position`);
    }

    // Create crop canvas
    const cropCanvas = createCanvas(cropW, cropH);
    const cropCtx    = cropCanvas.getContext('2d');
    cropCtx.drawImage(
      pageCanvas as unknown as HTMLCanvasElement,
      signImgLeft, cropTop, cropW, cropH,
      0,           0,       cropW, cropH
    );

    // Save
    const outPath = path.join(IMAGES_DIR, target.outFile);
    const buf     = cropCanvas.toBuffer('image/png');
    fs.writeFileSync(outPath, buf);

    const kb = (buf.length / 1024).toFixed(1);
    console.log(`    ✅  Saved: ${target.outFile}  (${kb} KB)`);

    factory.destroy({ canvas: pageCanvas, context: ctx });
    successCount++;
  }

  console.log('\n' + '─'.repeat(55));
  console.log(`✅  Extracted ${successCount}/${TARGETS.length} signs successfully`);
  console.log('\n⚠️   sign_telephone.png — NOT in this PDF edition.');
  console.log('    The Israeli Ministry of Transportation sign book (2022 edition)');
  console.log('    does not include a standalone telephone service sign.');
  console.log('    sign_telephone.png stays as placeholder for now.');
  console.log('\n🎯  Next steps:');
  console.log('    npx tsx backend/uploadContent.ts');
  console.log('    npx tsx scripts/generateVideos.ts');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
