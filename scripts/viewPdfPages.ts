// @ts-nocheck
/**
 * scripts/viewPdfPages.ts
 *
 * Renders specific PDF pages to PNG and creates a browsable HTML.
 * Used to visually identify which sign images correspond to the 3 missing signs.
 *
 * Run: npx tsx scripts/viewPdfPages.ts
 * Then open: scripts/pdf_pages.html in your browser
 */

import * as fs   from 'fs';
import * as path from 'path';
import { createCanvas, Canvas } from 'canvas';

const PDF_PATH   = path.join('C:/Users/Yakov/Downloads', 'State of Israel traffic sign board.pdf');
const OUTPUT_DIR = path.join(process.cwd(), 'scripts', 'pdf_page_images');
const OUTPUT_HTML = path.join(process.cwd(), 'scripts', 'pdf_pages.html');

// Pages to render — all pages that contain real traffic signs
// (skipping cover page 1, legal text pages 2-6, appendix pages 92-94)
const PAGE_RANGES = [
  { start: 7,  end: 15,  label: 'Warning Signs (100-153)' },
  { start: 16, end: 22,  label: 'Direction Signs (201-231)' },
  { start: 24, end: 26,  label: 'Right of Way (301-310)' },
  { start: 27, end: 35,  label: 'Prohibitions (401-441)' },
  { start: 36, end: 41,  label: 'Lane Directives (501-516)' },
  { start: 43, end: 55,  label: 'Information Signs (601-640)' },
];

const SCALE = 0.5; // Low resolution for quick viewing

interface CanvasCtx { canvas: Canvas; context: ReturnType<Canvas['getContext']> }

class NodeCanvasFactory {
  create(w: number, h: number): CanvasCtx {
    const canvas = createCanvas(w, h);
    return { canvas, context: canvas.getContext('2d') };
  }
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

  console.log(`📄  PDF has ${pdfDoc.numPages} pages. Rendering…\n`);

  const renderedPages: Array<{ page: number; label: string; file: string }> = [];

  for (const range of PAGE_RANGES) {
    console.log(`  📋  ${range.label} (pages ${range.start}-${range.end})`);

    for (let p = range.start; p <= range.end; p++) {
      const page     = await pdfDoc.getPage(p);
      const viewport = page.getViewport({ scale: SCALE });
      const { canvas, context } = factory.create(Math.round(viewport.width), Math.round(viewport.height));

      await page.render({
        canvasContext: context as unknown as CanvasRenderingContext2D,
        viewport,
        canvasFactory: factory as unknown as import('pdfjs-dist').CanvasFactory,
      }).promise;

      const outFile = `page_${String(p).padStart(3, '0')}.png`;
      const outPath = path.join(OUTPUT_DIR, outFile);
      const buf     = canvas.toBuffer('image/png');
      fs.writeFileSync(outPath, buf);
      factory.destroy({ canvas, context });

      renderedPages.push({ page: p, label: range.label, file: outFile });
      process.stdout.write(`    p${p} ✓  `);
    }
    console.log('');
  }

  // Build HTML with base64-embedded images (small enough at 0.5x scale)
  const sections = PAGE_RANGES.map(range => {
    const pages = renderedPages.filter(r => r.page >= range.start && r.page <= range.end);
    const imgs = pages.map(p => {
      const buf  = fs.readFileSync(path.join(OUTPUT_DIR, p.file));
      const b64  = buf.toString('base64');
      return `
        <div class="page-item">
          <div class="page-num">Page ${p.page}</div>
          <img src="data:image/png;base64,${b64}" alt="Page ${p.page}">
        </div>`;
    }).join('\n');

    return `
      <div class="section">
        <h2>${range.label}</h2>
        <div class="page-grid">${imgs}</div>
      </div>`;
  }).join('\n');

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>PDF Page Viewer</title>
  <style>
    body { background: #111; color: #eee; font-family: monospace; padding: 20px; }
    h1 { color: #fff; font-size: 20px; }
    h2 { color: #4ecca3; font-size: 15px; border-bottom: 1px solid #333; padding-bottom: 6px; margin-top: 30px; }
    .page-grid { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 20px; }
    .page-item { background: #1e1e1e; border: 1px solid #333; padding: 8px; border-radius: 6px; }
    .page-item img { display: block; max-width: 500px; border: 1px solid #444; }
    .page-num { font-size: 11px; color: #888; margin-bottom: 4px; direction: ltr; }
    .targets { background: #1a0d1a; border: 1px solid #e94560; border-radius: 8px; padding: 14px 18px; margin-bottom: 24px; font-size: 13px; direction: ltr; }
    .targets h3 { color: #e94560; margin-bottom: 8px; }
  </style>
</head>
<body>
  <h1>🪧 Israeli Traffic Sign PDF — Page Viewer</h1>
  <div class="targets">
    <h3>🎯 Looking for 3 missing signs:</h3>
    <ul>
      <li><strong>sign_roundabout.png</strong> — "מעגל תנועה" / "כיכר" — roundabout circle sign → probably page 9 (sign 121)</li>
      <li><strong>sign_highway_start.png</strong> — "כניסה לדרך מהירה" — highway entry sign → probably page 20 (sign 216)</li>
      <li><strong>sign_telephone.png</strong> — "טלפון" — telephone service sign → look through information pages 43-55</li>
    </ul>
  </div>
  ${sections}
</body>
</html>`;

  fs.writeFileSync(OUTPUT_HTML, html);
  console.log(`\n✅  HTML written to: scripts/pdf_pages.html`);
  console.log(`   Open it in your browser to browse the sign pages.`);
  console.log(`\n   🔍 Look for:`);
  console.log(`   • Roundabout circle sign (page ~9) — note the REVIEW file number`);
  console.log(`   • Highway start sign (page ~20) — note the REVIEW file number`);
  console.log(`   • Telephone/phone sign (pages ~43-55) — note the REVIEW file number`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
