/**
 * extractPdfText.mjs
 * Extracts all text from the driving theory PDF, page by page.
 * Output: content/theory_book_text.json  { pages: [ { page, text } ] }
 *
 * Usage: node scripts/extractPdfText.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');
const PDF_PATH  = join(ROOT, 'publications_2017_nohagim_aheret_nohagim_nachon.pdf');
const OUT_PATH  = join(ROOT, 'content', 'theory_book_text.json');

const require = createRequire(import.meta.url);
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

async function main() {
  console.log('📖 טוען PDF...');
  const data     = new Uint8Array(readFileSync(PDF_PATH));
  const loadTask = pdfjsLib.getDocument({ data, useSystemFonts: true });
  const pdf      = await loadTask.promise;
  const numPages = pdf.numPages;
  console.log(`   עמודים: ${numPages}`);

  const pages = [];

  for (let p = 1; p <= numPages; p++) {
    process.stdout.write(`\r   עמוד ${p}/${numPages}...`);
    const page    = await pdf.getPage(p);
    const content = await page.getTextContent();
    const text    = content.items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();
    pages.push({ page: p, text });
  }

  console.log('\n✅ חילוץ הושלם');

  writeFileSync(OUT_PATH, JSON.stringify({ total_pages: numPages, pages }, null, 2), 'utf-8');
  console.log(`✅ נשמר: content/theory_book_text.json`);

  // Print preview — find "הרכב שלי" section
  console.log('\n🔍 מחפש "הרכב שלי"...');
  for (const p of pages) {
    if (p.text.includes('הרכב שלי') || p.text.includes('הכרת הרכב')) {
      console.log(`\n  עמוד ${p.page}: ${p.text.substring(0, 200)}`);
      console.log('  ---');
    }
  }
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
