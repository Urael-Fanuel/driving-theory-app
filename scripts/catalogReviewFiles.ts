/**
 * scripts/catalogReviewFiles.ts
 *
 * Generates assets/images/review_catalog.html —
 * an HTML page showing all REVIEW_sign_NNN.png files as thumbnails.
 *
 * Open the HTML in a browser to visually find the 3 missing signs:
 *   sign_roundabout.png    → circle/roundabout junction
 *   sign_highway_start.png → highway/motorway start
 *   sign_telephone.png     → telephone service
 *
 * Run:
 *   npx tsx scripts/catalogReviewFiles.ts
 */

import * as fs   from 'fs';
import * as path from 'path';

const IMAGES_DIR  = path.join(process.cwd(), 'assets', 'images');
const OUTPUT_HTML = path.join(IMAGES_DIR, 'review_catalog.html');

const reviewFiles = fs.readdirSync(IMAGES_DIR)
  .filter(f => f.startsWith('REVIEW_sign_') && f.endsWith('.png'))
  .sort((a, b) => {
    const na = parseInt(a.replace('REVIEW_sign_', '').replace('.png', ''), 10);
    const nb = parseInt(b.replace('REVIEW_sign_', '').replace('.png', ''), 10);
    return na - nb;
  });

if (reviewFiles.length === 0) {
  console.log('No REVIEW files found in assets/images/');
  process.exit(0);
}

const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>REVIEW Sign Catalog (${reviewFiles.length} files)</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #1a1a2e;
      color: #eee;
      font-family: 'Segoe UI', monospace;
      padding: 20px;
    }
    h1 { font-size: 18px; margin-bottom: 6px; color: #fff; }
    .subtitle {
      font-size: 13px;
      color: #aaa;
      margin-bottom: 20px;
      direction: ltr;
      text-align: left;
    }
    .targets {
      background: #16213e;
      border: 1px solid #e94560;
      border-radius: 8px;
      padding: 14px 18px;
      margin-bottom: 24px;
      font-size: 13px;
      direction: ltr;
    }
    .targets h2 { font-size: 14px; color: #e94560; margin-bottom: 8px; }
    .targets li { margin: 4px 0; }
    .targets code { background: #0f3460; padding: 2px 6px; border-radius: 3px; color: #a8d8ea; }
    .grid {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .item {
      background: #16213e;
      border: 2px solid #0f3460;
      border-radius: 8px;
      padding: 8px;
      text-align: center;
      cursor: pointer;
      transition: border-color 0.15s;
      width: 140px;
    }
    .item:hover { border-color: #e94560; }
    .item.selected { border-color: #4ecca3; background: #0f2d25; }
    .item img {
      width: 110px;
      height: 110px;
      object-fit: contain;
      background: white;
      border-radius: 4px;
      display: block;
    }
    .item .num {
      font-size: 13px;
      font-weight: bold;
      margin-top: 6px;
      color: #a8d8ea;
      direction: ltr;
    }
    .item .cmd {
      font-size: 9px;
      color: #666;
      margin-top: 2px;
      direction: ltr;
      word-break: break-all;
    }
    .instructions {
      position: fixed;
      bottom: 0; left: 0; right: 0;
      background: #0d0d1a;
      border-top: 1px solid #0f3460;
      padding: 10px 20px;
      font-size: 12px;
      direction: ltr;
      color: #aaa;
    }
    .instructions strong { color: #4ecca3; }
  </style>
</head>
<body>
  <h1>🪧 REVIEW Sign Catalog — ${reviewFiles.length} files</h1>
  <div class="subtitle">
    File: assets/images/review_catalog.html &nbsp;|&nbsp;
    Signs shown are real images from the Israeli Ministry of Transportation PDF
  </div>

  <div class="targets">
    <h2>🎯 3 Signs Still Missing — Find them visually:</h2>
    <ul>
      <li><code>sign_roundabout.png</code> — Roundabout circle junction sign</li>
      <li><code>sign_highway_start.png</code> — Motorway / expressway start sign</li>
      <li><code>sign_telephone.png</code> — Telephone service sign (phone icon)</li>
    </ul>
    <br>
    <strong>How to fix:</strong> When you find a match, run in the terminal:<br>
    <code style="direction:ltr">
      rename assets\\images\\REVIEW_sign_NNN.png assets\\images\\sign_roundabout.png
    </code>
  </div>

  <div class="grid">
${reviewFiles.map(f => {
  const num = f.replace('REVIEW_sign_', '').replace('.png', '');
  return `    <div class="item" onclick="this.classList.toggle('selected')" title="Click to highlight">
      <img src="./${f}" alt="${f}" loading="lazy">
      <div class="num">sign_${num}</div>
      <div class="cmd">REVIEW_sign_${num}.png</div>
    </div>`;
}).join('\n')}
  </div>

  <div class="instructions">
    <strong>Click</strong> a tile to highlight it &nbsp;|&nbsp;
    Find the roundabout, highway start, and telephone signs &nbsp;|&nbsp;
    Note the <strong>sign number</strong>, then rename in the terminal
  </div>

</body>
</html>`;

fs.writeFileSync(OUTPUT_HTML, html);

console.log(`✅  Catalog written to: assets/images/review_catalog.html`);
console.log(`\n   Open it in your browser (double-click in Explorer)`);
console.log(`   Browse the ${reviewFiles.length} images and find the 3 missing signs:\n`);
console.log(`   🔵 sign_roundabout.png    → circle junction sign`);
console.log(`   🟢 sign_highway_start.png → motorway start sign`);
console.log(`   🟡 sign_telephone.png     → telephone service sign`);
console.log(`\n   When found, rename in terminal:`);
console.log(`   rename assets\\images\\REVIEW_sign_NNN.png assets\\images\\sign_roundabout.png`);
console.log(`   rename assets\\images\\REVIEW_sign_NNN.png assets\\images\\sign_highway_start.png`);
console.log(`   rename assets\\images\\REVIEW_sign_NNN.png assets\\images\\sign_telephone.png`);
