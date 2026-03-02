/**
 * scripts/dumpPdfText.ts
 *
 * Dumps ALL text from every PDF page, groups by sign number rows,
 * and searches for keywords to find the 3 missing signs.
 *
 * Run: npx tsx scripts/dumpPdfText.ts
 */

import * as fs   from 'fs';
import * as path from 'path';

const PDF_PATH = path.join('C:/Users/Yakov/Downloads', 'State of Israel traffic sign board.pdf');

// Keywords to search (broad — single characters and substrings too)
const SEARCHES = [
  { name: 'sign_roundabout.png',    terms: ['כיכר', 'כיכרות', 'עגולה', 'תנועה חוגגת', 'חוגגת'] },
  { name: 'sign_highway_start.png', terms: ['מהיר', 'אוטוסטרדה', 'אוטוסטרדה', 'כניסה', 'high'] },
  { name: 'sign_telephone.png',     terms: ['טלפון', 'פלאפון', 'טל\'', 'מכשיר', 'שיחה', 'קו'] },
];

async function main(): Promise<void> {
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
  (pdfjsLib as any).GlobalWorkerOptions.workerSrc = false;

  const pdfData = new Uint8Array(fs.readFileSync(PDF_PATH));
  const pdfDoc  = await pdfjsLib.getDocument({ data: pdfData }).promise;

  console.log(`📄  PDF has ${pdfDoc.numPages} pages\n`);

  // Collect all (signNumber → rowText) pairs from all pages
  const allRows: Array<{ num: string; text: string; page: number }> = [];
  // Also collect all text items that contain any search term
  const allMatches: Array<{ term: string; context: string; page: number; nearNums: string[] }> = [];

  for (let p = 1; p <= pdfDoc.numPages; p++) {
    const page        = await pdfDoc.getPage(p);
    const textContent = await page.getTextContent();
    const items = (textContent.items as Array<{ str: string; transform: number[] }>)
      .map(it => ({ str: it.str.trim(), tx: it.transform[4], ty: it.transform[5] }))
      .filter(it => it.str.length > 0);

    // Find sign number items (2–4 digit integers ≥ 100)
    const numItems = items.filter(it => /^\d{2,4}$/.test(it.str) && parseInt(it.str) >= 100);

    // Estimate row half-height
    let halfRow = 30;
    if (numItems.length > 1) {
      const sorted = [...numItems].sort((a, b) => b.ty - a.ty);
      const sp = sorted.slice(1)
        .map((r, i) => Math.abs(sorted[i].ty - r.ty))
        .filter(s => s > 2)
        .sort((a, b) => a - b);
      if (sp.length > 0) halfRow = sp[Math.floor(sp.length / 2)] * 0.6;
    }

    // Build row text for each sign number
    for (const num of numItems) {
      const rowText = items
        .filter(it => Math.abs(it.ty - num.ty) <= halfRow)
        .map(it => it.str)
        .join(' ');
      allRows.push({ num: num.str, text: rowText, page: p });
    }

    // Also do a full-page text dump and search
    const fullPageText = items.map(it => it.str).join(' ');

    for (const search of SEARCHES) {
      for (const term of search.terms) {
        if (fullPageText.includes(term)) {
          // Find which sign numbers appear on this page
          const nearNums = numItems.map(n => n.str);
          // Find items near the term
          const matchingItems = items.filter(it => it.str.includes(term));
          for (const mi of matchingItems) {
            const context = items
              .filter(it => Math.abs(it.ty - mi.ty) <= 60)
              .map(it => it.str)
              .join(' ');
            // Find nearest sign number
            const nearestNums = numItems
              .filter(n => Math.abs(n.ty - mi.ty) <= 100)
              .map(n => n.str);
            allMatches.push({
              term,
              context: context.slice(0, 120),
              page: p,
              nearNums: nearestNums.length > 0 ? nearestNums : nearNums.slice(0, 5),
            });
          }
        }
      }
    }
  }

  // ── Print search results ──────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════');
  console.log('  KEYWORD SEARCH RESULTS');
  console.log('═══════════════════════════════════════════════════════\n');

  for (const search of SEARCHES) {
    console.log(`🎯  ${search.name}`);
    const hits = allMatches.filter(m => search.terms.includes(m.term));
    if (hits.length === 0) {
      console.log(`   ❌  None of these terms found: ${search.terms.join(', ')}`);
    } else {
      for (const h of hits.slice(0, 6)) {
        console.log(`   ✅  Term: "${h.term}"  page ${h.page}  near signs: [${h.nearNums.join(', ')}]`);
        console.log(`      Context: "${h.context}"`);
      }
    }
    console.log();
  }

  // ── Print all sign rows (so we can search manually) ──────────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  ALL SIGN ROWS FOUND IN PDF');
  console.log('═══════════════════════════════════════════════════════\n');

  // Sort by sign number
  allRows.sort((a, b) => parseInt(a.num) - parseInt(b.num));

  // Deduplicate by sign number
  const seen = new Set<string>();
  for (const row of allRows) {
    if (seen.has(row.num)) continue;
    seen.add(row.num);
    console.log(`  [${row.num.padStart(4)}]  p${row.page}  ${row.text.slice(0, 100)}`);
  }

  console.log(`\nTotal unique sign numbers found: ${seen.size}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
