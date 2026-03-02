/**
 * scripts/findMissingSigns.ts
 *
 * One-shot fix: finds the 3 remaining unmatched signs in the PDF
 * by scanning text for their Hebrew keywords, then renames the matching
 * REVIEW_sign_NNN.png files to the correct image_filename.
 *
 * Signs to fix:
 *   sign_roundabout.png    → "כיכר"
 *   sign_highway_start.png → "כביש מהיר" / "כניסה"
 *   sign_telephone.png     → "טלפון"
 *
 * Run:
 *   npx tsx scripts/findMissingSigns.ts
 */

import * as fs   from 'fs';
import * as path from 'path';

const PDF_PATH   = path.join('C:/Users/Yakov/Downloads', 'State of Israel traffic sign board.pdf');
const IMAGES_DIR = path.join(process.cwd(), 'assets', 'images');

// Signs to hunt for: each entry has the target filename + keywords that must ALL appear
const TARGETS = [
  {
    filename: 'sign_roundabout.png',
    label:    'כיכר (roundabout)',
    keywords: ['כיכר'],
  },
  {
    filename: 'sign_highway_start.png',
    label:    'כניסה לכביש מהיר',
    // "כביש מהיר" is the key distinguishing phrase
    keywords: ['כביש', 'מהיר'],
  },
  {
    filename: 'sign_telephone.png',
    label:    'טלפון',
    keywords: ['טלפון'],
  },
];

async function main(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
  (pdfjsLib as { GlobalWorkerOptions: { workerSrc: boolean } })
    .GlobalWorkerOptions.workerSrc = false;

  console.log('🔍  Hunting 3 missing signs in PDF…\n');

  const pdfData = new Uint8Array(fs.readFileSync(PDF_PATH));
  const pdfDoc  = await pdfjsLib.getDocument({ data: pdfData }).promise;

  // Build map: signNumber → rowText  (re-scan all pages)
  const signTextMap = new Map<string, string>();

  for (let p = 1; p <= pdfDoc.numPages; p++) {
    const page        = await pdfDoc.getPage(p);
    const textContent = await page.getTextContent();
    const items       = (textContent.items as Array<{ str: string; transform: number[] }>)
      .map(it => ({ str: it.str.trim(), tx: it.transform[4], ty: it.transform[5] }));

    const numItems = items.filter(it => /^\d{2,4}$/.test(it.str) && parseInt(it.str) >= 100);
    if (numItems.length === 0) continue;

    // Estimate row spacing
    const sorted = [...numItems].sort((a, b) => b.ty - a.ty);
    let halfRow  = 30;
    if (sorted.length > 1) {
      const sp = sorted.slice(1)
        .map((r, i) => Math.abs(sorted[i].ty - r.ty))
        .filter(s => s > 2)
        .sort((a, b) => a - b);
      if (sp.length > 0) halfRow = sp[Math.floor(sp.length / 2)] * 0.6;
    }

    for (const num of numItems) {
      const rowText = items
        .filter(it => Math.abs(it.ty - num.ty) <= halfRow)
        .map(it => it.str)
        .join(' ');
      if (!signTextMap.has(num.str)) signTextMap.set(num.str, rowText);
    }
  }

  console.log(`   Scanned ${signTextMap.size} sign numbers.\n`);

  // For each target, find best matching sign number
  let anyFixed = false;
  for (const target of TARGETS) {
    // Check if still placeholder
    const destPath = path.join(IMAGES_DIR, target.filename);
    const size = fs.existsSync(destPath) ? fs.statSync(destPath).size : 0;
    if (size > 15 * 1024) {
      console.log(`  ⏭  ${target.filename} — already real image, skipping`);
      continue;
    }

    // Score each sign number by how many keywords match
    let bestNum   = '';
    let bestScore = 0;
    let bestText  = '';

    for (const [num, text] of signTextMap.entries()) {
      const matched = target.keywords.filter(kw => text.includes(kw));
      const score   = matched.length / target.keywords.length;
      if (score > bestScore || (score === bestScore && score > 0 && num < bestNum)) {
        bestScore = score;
        bestNum   = num;
        bestText  = text;
      }
    }

    if (bestScore === 0) {
      console.log(`  ❌  ${target.filename} ["${target.label}"] — keyword not found in PDF`);
      continue;
    }

    const reviewFile = `REVIEW_sign_${bestNum}.png`;
    const reviewPath = path.join(IMAGES_DIR, reviewFile);

    console.log(`  🎯  ${target.filename}`);
    console.log(`      Best match: sign ${bestNum} (${Math.round(bestScore * 100)}% keywords)`);
    console.log(`      Row text:   "${bestText.slice(0, 80)}"`);

    if (fs.existsSync(reviewPath)) {
      fs.copyFileSync(reviewPath, destPath);
      fs.unlinkSync(reviewPath);
      console.log(`      ✅ Renamed ${reviewFile} → ${target.filename}\n`);
      anyFixed = true;
    } else {
      // REVIEW file may have already been renamed in Phase 1 or 2 to some other sign
      // Find any REVIEW file by scanning for the number
      console.log(`      ⚠️  ${reviewFile} not found in assets/images/`);
      console.log(`         The sign may be under a different number. Check around sign ${bestNum}.\n`);
    }
  }

  if (!anyFixed) {
    console.log('\n⚠️  No files were renamed.');
    console.log('   Possible reasons:');
    console.log('   1. The signs use different Hebrew text in this specific PDF edition');
    console.log('   2. The REVIEW files were already used for other signs');
    console.log('   3. These signs appear with 4-digit numbers in this PDF\n');
    console.log('   Manual fix: open assets/images/ in Explorer, find the correct');
    console.log('   REVIEW_sign_NNN.png, and rename it to the target filename.');
  }

  // Print all remaining REVIEW files for reference
  const remaining = fs.readdirSync(IMAGES_DIR)
    .filter(f => f.startsWith('REVIEW_sign_') && f.endsWith('.png'))
    .sort();
  console.log(`\n📂  Remaining REVIEW files: ${remaining.length}`);
  remaining.slice(0, 20).forEach(f => console.log(`   ${f}`));
  if (remaining.length > 20) console.log(`   … and ${remaining.length - 20} more`);

  console.log('\n🎯 When done:\n   npx tsx backend/uploadContent.ts\n   npx tsx scripts/generateVideos.ts');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
