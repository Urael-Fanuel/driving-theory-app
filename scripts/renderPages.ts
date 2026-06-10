// @ts-nocheck
/**
 * scripts/renderPages.ts
 *
 * Renders specific PDF pages to PNG files so they can be viewed visually.
 * Saves to scripts/rendered_pages/
 *
 * Run: npx tsx scripts/renderPages.ts
 */

import * as fs   from 'fs';
import * as path from 'path';
import { createCanvas, Canvas } from 'canvas';

const PDF_PATH   = path.join('C:/Users/Yakov/Downloads', 'State of Israel traffic sign board.pdf');
const OUTPUT_DIR = path.join(process.cwd(), 'scripts', 'rendered_pages');

// Pages to render for identifying the 3 missing signs:
//   Page 9  → warning signs ~100-121 (roundabout)
//   Page 20 → direction signs ~215-219 (highway start/end)
//   Pages 43-55 → information signs 601-640 (telephone?)
const PAGES_TO_RENDER = [9, 20, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55];

const SCALE = 1.5; // Good quality for reading

interface CanvasCtx { canvas: Canvas; context: ReturnType<Canvas['getContext']> }
class NodeCanvasFactory {
  create(w: number, h: number): CanvasCtx { const c = createCanvas(w, h); return { canvas: c, context: c.getContext('2d') }; }
  reset(o: CanvasCtx, w: number, h: number) { o.canvas.width = w; o.canvas.height = h; }
  destroy(o: CanvasCtx) { o.canvas.width = 0; o.canvas.height = 0; }
}

async function main(): Promise<void> {
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
  (pdfjsLib as any).GlobalWorkerOptions.workerSrc = false;

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const pdfData = new Uint8Array(fs.readFileSync(PDF_PATH));
  const pdfDoc  = await pdfjsLib.getDocument({ data: pdfData }).promise;
  const factory = new NodeCanvasFactory();

  for (const pageNum of PAGES_TO_RENDER) {
    if (pageNum > pdfDoc.numPages) continue;
    process.stdout.write(`  Rendering page ${pageNum}… `);

    const page     = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: SCALE });
    const { canvas, context } = factory.create(Math.round(viewport.width), Math.round(viewport.height));

    await page.render({
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
      canvasFactory: factory as unknown as import('pdfjs-dist').CanvasFactory,
    }).promise;

    const outPath = path.join(OUTPUT_DIR, `page_${String(pageNum).padStart(3,'0')}.png`);
    fs.writeFileSync(outPath, canvas.toBuffer('image/png'));
    factory.destroy({ canvas, context });
    console.log(`✓  → ${outPath}`);
  }

  console.log(`\n✅  Done! ${PAGES_TO_RENDER.length} pages rendered to scripts/rendered_pages/`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
