/**
 * imageMatchMoT.mjs
 * Matches MoT official sign images to our sign images using perceptual hashing.
 * Then generates a comparison report: MoT question/answer vs our Amharic content.
 *
 * Usage: node scripts/imageMatchMoT.mjs
 */

import { createCanvas, loadImage } from 'canvas';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUTPUT_DIR = join(__dirname, 'output');
const MOT_IMG_DIR = join(OUTPUT_DIR, 'mot_images');
mkdirSync(MOT_IMG_DIR, { recursive: true });

// ─── image comparison ─────────────────────────────────────────────────────────
const CMP_SIZE = 64; // 64×64 grayscale pixel vector

async function computePixels(source) {
  // Load image, whiten background, resize to 64×64 grayscale
  let imgSource = source;
  if (typeof source === 'string') imgSource = readFileSync(source);
  const img = await loadImage(imgSource);

  const canvas = createCanvas(CMP_SIZE, CMP_SIZE);
  const ctx = canvas.getContext('2d');
  // fill white (for transparent PNGs)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, CMP_SIZE, CMP_SIZE);
  ctx.drawImage(img, 0, 0, CMP_SIZE, CMP_SIZE);
  const { data } = ctx.getImageData(0, 0, CMP_SIZE, CMP_SIZE);

  const pixels = new Float32Array(CMP_SIZE * CMP_SIZE);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    pixels[j] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
  }
  return pixels;
}

function similarity(a, b) {
  // Normalized cross-correlation — works well even with brightness/contrast differences
  let sumA = 0, sumB = 0;
  for (let i = 0; i < a.length; i++) { sumA += a[i]; sumB += b[i]; }
  const meanA = sumA / a.length;
  const meanB = sumB / b.length;
  let num = 0, denomA = 0, denomB = 0;
  for (let i = 0; i < a.length; i++) {
    const da = a[i] - meanA, db = b[i] - meanB;
    num += da * db; denomA += da * da; denomB += db * db;
  }
  const denom = Math.sqrt(denomA * denomB);
  if (denom < 1e-6) return 0;
  return (num / denom + 1) / 2; // normalize to [0,1]
}

// ─── download helper ─────────────────────────────────────────────────────────
async function downloadImage(url, dest) {
  if (existsSync(dest)) return true; // already cached
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(dest, buf);
    return true;
  } catch {
    return false;
  }
}

// ─── load our sign images ────────────────────────────────────────────────────
const ALL_IMAGE_FOLDERS = readdirSync(join(ROOT, 'assets', 'images'))
  .map(f => join(ROOT, 'assets', 'images', f));

function findOurImagePath(sign) {
  for (const folder of ALL_IMAGE_FOLDERS) {
    const p = join(folder, sign.image_filename);
    if (existsSync(p)) return p;
  }
  return null;
}

// ─── main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🖼️  imageMatchMoT.mjs — Image-based sign matching');
  console.log('═'.repeat(60));

  // Load data
  const motAll = JSON.parse(readFileSync(join(OUTPUT_DIR, 'mot_questions.json'), 'utf8'));
  const ourSigns = JSON.parse(readFileSync(join(ROOT, 'content', 'signs.json'), 'utf8'));

  const motQs = motAll.filter(q => q.category === 'תמרורים' && q.imageUrl);
  console.log(`\n📋 MoT traffic sign questions with images: ${motQs.length}`);

  // Unique MoT images
  const motImages = {};
  for (const q of motQs) {
    if (!motImages[q.imageUrl]) motImages[q.imageUrl] = [];
    motImages[q.imageUrl].push(q);
  }
  const uniqueMotUrls = Object.keys(motImages);
  console.log(`🔗 Unique MoT images: ${uniqueMotUrls.length}`);

  // ── Step 1: Download all MoT images ────────────────────────────────────────
  console.log('\n📥 Downloading MoT images...');
  let downloaded = 0, failed = 0;
  const motLocalPaths = {};
  for (let i = 0; i < uniqueMotUrls.length; i++) {
    const url = uniqueMotUrls[i];
    const fname = basename(url);
    const dest = join(MOT_IMG_DIR, fname);
    const ok = await downloadImage(url, dest);
    if (ok) { motLocalPaths[url] = dest; downloaded++; }
    else { failed++; }
    if ((i + 1) % 50 === 0) process.stdout.write(`\r  ${i + 1}/${uniqueMotUrls.length} (✅${downloaded} ❌${failed})`);
  }
  console.log(`\r  Done: ✅ ${downloaded} downloaded, ❌ ${failed} failed`);

  // ── Step 2: Compute hashes for our signs ───────────────────────────────────
  console.log('\n🔢 Computing perceptual hashes for our signs...');
  const ourHashes = [];
  let ourOk = 0, ourSkipped = 0;
  for (const sign of ourSigns) {
    const imgPath = findOurImagePath(sign);
    if (!imgPath) { ourSkipped++; continue; }
    try {
      const hash = await computePixels(imgPath);
      ourHashes.push({ sign, imgPath, hash });
      ourOk++;
    } catch {
      ourSkipped++;
    }
  }
  console.log(`  ✅ Hashed: ${ourOk} signs, ⏭️ Skipped: ${ourSkipped}`);

  // ── Step 3: Compute hashes for MoT images and find best match ─────────────
  console.log('\n🔗 Matching MoT images to our signs...');
  const MATCH_THRESHOLD = 0.80; // similarity must be ≥ 80% (NCC-based)

  const results = []; // { motUrl, motQs, bestMatch, bestSim }
  let matched = 0, noMatch = 0;

  for (let i = 0; i < uniqueMotUrls.length; i++) {
    const url = uniqueMotUrls[i];
    const localPath = motLocalPaths[url];
    if (!localPath) continue;

    let motHash;
    try { motHash = await computePixels(localPath); } catch { continue; }

    let bestSim = 0, bestMatch = null;
    for (const { sign, imgPath, hash } of ourHashes) {
      const sim = similarity(motHash, hash);
      if (sim > bestSim) { bestSim = sim; bestMatch = { sign, imgPath }; }
    }

    const isMatch = bestSim >= MATCH_THRESHOLD;
    if (isMatch) matched++;
    else noMatch++;

    results.push({
      motUrl: url,
      motQuestions: motImages[url],
      bestMatch: isMatch ? bestMatch : null,
      bestSim: Math.round(bestSim * 100),
    });

    if ((i + 1) % 50 === 0) process.stdout.write(`\r  ${i + 1}/${uniqueMotUrls.length} matched`);
  }
  console.log(`\r  ✅ Matched: ${matched}, ❓ No match: ${noMatch}`);

  // ── Step 4: Save JSON results ──────────────────────────────────────────────
  const jsonOut = results.map(r => ({
    motImageUrl: r.motUrl,
    similarity: r.bestSim,
    matched: !!r.bestMatch,
    ourSignId: r.bestMatch?.sign?.id || null,
    ourSignNumber: r.bestMatch?.sign?.image_filename?.replace('.png', '') || null,
    ourExplanation: r.bestMatch?.sign?.explanation_amharic?.substring(0, 100) || null,
    motQuestions: r.motQuestions.map(q => ({
      id: q.questionId,
      question: q.questionText,
      correctAnswer: q.correctAnswer,
      allAnswers: q.answers.map(a => a.text),
    })),
  }));
  writeFileSync(join(OUTPUT_DIR, 'image_match_results.json'), JSON.stringify(jsonOut, null, 2));

  // ── Step 5: Generate HTML report ───────────────────────────────────────────
  console.log('\n📄 Generating HTML comparison report...');

  // Sort: matched first, then by similarity desc
  results.sort((a, b) => {
    if (!!a.bestMatch !== !!b.bestMatch) return a.bestMatch ? -1 : 1;
    return b.bestSim - a.bestSim;
  });

  const rows = results.map(r => {
    const { motUrl, motQuestions, bestMatch, bestSim } = r;
    const sign = bestMatch?.sign;
    const ourImgRel = bestMatch?.imgPath?.replace(ROOT + '\\', '').replace(/\\/g, '/');

    const qRows = motQuestions.map(q => {
      const answersHtml = q.answers.map(a =>
        `<li style="color:${a.isCorrect ? '#1b5e20' : '#555'};font-weight:${a.isCorrect ? 'bold' : 'normal'}">${a.isCorrect ? '✓ ' : ''}${a.text}</li>`
      ).join('');
      return `
        <div class="mot-q">
          <div class="q-text"><strong>${q.questionId}.</strong> ${q.questionText}</div>
          <ul class="answers">${answersHtml}</ul>
        </div>`;
    }).join('');

    const statusColor = !bestMatch ? '#fff3e0' : bestSim >= 90 ? '#e8f5e9' : '#fff9c4';
    const statusIcon = !bestMatch ? '❓' : bestSim >= 90 ? '✅' : '⚠️';
    const simBadge = `<span class="sim-badge" style="background:${bestSim >= 90 ? '#4caf50' : bestSim >= 75 ? '#ff9800' : '#f44336'}">${bestSim}%</span>`;

    const ourContent = sign ? `
      <div class="our-sign-id">${sign.id}</div>
      <div class="our-name">${sign.name_amharic || ''}</div>
      <div class="our-exp">${sign.explanation_amharic?.substring(0, 150) || '—'}${sign.explanation_amharic?.length > 150 ? '...' : ''}</div>
    ` : '<div style="color:#999">לא הותאם</div>';

    const ourImgHtml = bestMatch?.imgPath ? `<img src="../${ourImgRel}" class="sign-img our-img" title="${sign?.id}">` : '';

    return `
    <tr style="background:${statusColor}" data-matched="${!!bestMatch}" data-sim="${bestSim}">
      <td class="img-cell">
        <img src="${motUrl}" class="sign-img" onerror="this.style.display='none'">
        ${simBadge}
        <div style="font-size:10px;color:#999;margin-top:2px">${statusIcon}</div>
      </td>
      <td class="q-cell">${qRows}</td>
      <td class="img-cell">${ourImgHtml}</td>
      <td class="our-cell">${ourContent}</td>
    </tr>`;
  }).join('');

  const matchedCount = results.filter(r => r.bestMatch).length;
  const highSim = results.filter(r => r.bestSim >= 90).length;
  const medSim = results.filter(r => r.bestMatch && r.bestSim < 90).length;

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<title>השוואה לפי תמונות — MoT vs האפליקציה</title>
<style>
  body { font-family: Arial, sans-serif; margin: 16px; background: #f5f5f5; font-size: 13px; }
  h1 { color: #1a237e; margin-bottom: 8px; }
  .summary { display: flex; gap: 12px; margin: 12px 0; flex-wrap: wrap; }
  .stat { background: white; border-radius: 8px; padding: 12px 20px; box-shadow: 0 2px 6px #0001; text-align: center; }
  .stat .num { font-size: 1.8em; font-weight: bold; color: #1565c0; }
  .stat .lbl { font-size: 11px; color: #666; }
  .filters { margin: 12px 0; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  select, input { padding: 5px 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px #0001; }
  th { background: #1565c0; color: white; padding: 8px; text-align: right; }
  td { border-bottom: 1px solid #eee; vertical-align: top; padding: 8px; }
  tr:hover td { filter: brightness(0.97); }
  .img-cell { width: 110px; text-align: center; }
  .sign-img { max-width: 90px; max-height: 90px; border-radius: 4px; border: 1px solid #ddd; background: white; }
  .our-img { border: 2px solid #1565c0; }
  .sim-badge { display: inline-block; padding: 2px 6px; border-radius: 10px; color: white; font-size: 11px; font-weight: bold; margin-top: 4px; }
  .q-cell { min-width: 280px; }
  .our-cell { min-width: 200px; direction: ltr; }
  .mot-q { margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px dashed #eee; }
  .mot-q:last-child { border-bottom: none; margin-bottom: 0; }
  .q-text { color: #333; margin-bottom: 4px; }
  .answers { margin: 0; padding-right: 16px; list-style: none; }
  .answers li { font-size: 12px; margin: 1px 0; }
  .our-sign-id { font-weight: bold; color: #1565c0; font-size: 12px; }
  .our-name { font-size: 12px; color: #333; margin: 2px 0; }
  .our-exp { font-size: 11px; color: #555; direction: ltr; text-align: left; }
  .legend { display: flex; gap: 12px; margin: 8px 0; font-size: 12px; }
  .legend span { display: flex; align-items: center; gap: 4px; }
</style>
</head>
<body>
<h1>🖼️ השוואת תמרורים לפי תמונות — MoT vs האפליקציה</h1>

<div class="summary">
  <div class="stat"><div class="num">${uniqueMotUrls.length}</div><div class="lbl">תמונות MoT ייחודיות</div></div>
  <div class="stat"><div class="num">${matchedCount}</div><div class="lbl">הותאמו לתמרורינו</div></div>
  <div class="stat"><div class="num">${highSim}</div><div class="lbl">התאמה ≥90% ✅</div></div>
  <div class="stat"><div class="num">${medSim}</div><div class="lbl">התאמה 75-89% ⚠️</div></div>
  <div class="stat"><div class="num">${results.length - matchedCount}</div><div class="lbl">לא הותאמו ❓</div></div>
</div>

<div class="legend">
  <span><span style="background:#4caf50;color:white;padding:2px 6px;border-radius:10px;font-size:11px">XX%</span> ≥90% = התאמה חזקה ✅</span>
  <span><span style="background:#ff9800;color:white;padding:2px 6px;border-radius:10px;font-size:11px">XX%</span> 75-89% = התאמה חלקית ⚠️</span>
  <span>❓ = לא נמצאה התאמה</span>
</div>

<div class="filters">
  <select onchange="filterRows(this.value)">
    <option value="all">הכל (${results.length})</option>
    <option value="matched">הותאמו (${matchedCount})</option>
    <option value="unmatched">לא הותאמו (${results.length - matchedCount})</option>
  </select>
  <input type="text" placeholder="חיפוש..." oninput="searchRows(this.value)" style="width:200px">
  <span style="font-size:12px;color:#666">סדר: לפי דמיון (גבוה → נמוך)</span>
</div>

<table>
<thead>
  <tr>
    <th>תמונת MoT</th>
    <th>שאלה + תשובות (עברית)</th>
    <th>תמרור שלנו</th>
    <th>תוכן שלנו (אמהרית)</th>
  </tr>
</thead>
<tbody id="tbody">
${rows}
</tbody>
</table>

<script>
function filterRows(val) {
  document.querySelectorAll('#tbody tr').forEach(r => {
    const m = r.dataset.matched === 'true';
    if (val === 'all') r.style.display = '';
    else if (val === 'matched') r.style.display = m ? '' : 'none';
    else r.style.display = !m ? '' : 'none';
  });
}
function searchRows(q) {
  const lq = q.toLowerCase();
  document.querySelectorAll('#tbody tr').forEach(r => {
    r.style.display = r.textContent.toLowerCase().includes(lq) ? '' : 'none';
  });
}
</script>
</body>
</html>`;

  writeFileSync(join(OUTPUT_DIR, 'image_comparison_report.html'), html);

  console.log('\n' + '═'.repeat(60));
  console.log('🎉 Done!');
  console.log(`   MoT images processed : ${results.length}`);
  console.log(`   Matched (≥75%)       : ${matchedCount}`);
  console.log(`   High confidence ≥90% : ${highSim}`);
  console.log(`   No match             : ${results.length - matchedCount}`);
  console.log(`\n📂 Open: scripts/output/image_comparison_report.html`);
  console.log(`📂 Data: scripts/output/image_match_results.json`);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
