/**
 * geminiMatchMoT.mjs
 * Uses Gemini vision to identify each MoT question image,
 * then matches it to our signs by description.
 *
 * Usage: node --env-file=.env scripts/geminiMatchMoT.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUTPUT_DIR = join(__dirname, 'output');
const MOT_IMG_DIR = join(OUTPUT_DIR, 'mot_images');
mkdirSync(OUTPUT_DIR, { recursive: true });

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-2.5-flash';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

const CONCURRENCY = 5;
const CACHE_FILE = join(OUTPUT_DIR, 'gemini_identifications.json');

// ─── helpers ─────────────────────────────────────────────────────────────────

function findOurImagePath(sign) {
  const folders = readdirSync(join(ROOT, 'assets', 'images'))
    .map(f => join(ROOT, 'assets', 'images', f));
  for (const folder of folders) {
    const p = join(folder, sign.image_filename);
    if (existsSync(p)) return p;
  }
  return null;
}

async function identifySignWithGemini(imageBuffer) {
  const base64 = imageBuffer.toString('base64');
  const prompt = `זוהי תמונה של תמרור ישראלי המופיע בשאלת מבחן תיאוריה.

זהה את התמרור ותאר אותו בעברית בתמציתיות.
ענה ONLY בפורמט JSON הבא ללא שום טקסט נוסף:
{
  "sign_description": "תיאור קצר של התמרור בעברית (2-6 מילים)",
  "sign_type": "חובה/אזהרה/זכות קדימה/איסור/תחבורה ציבורית/מודיעין/רמזור/סימון כביש/אתר עבודה",
  "sign_number_visible": "מספר אם נראה בתמונה, אחרת null",
  "what_driver_must_do": "מה על הנהג לעשות/להבין (משפט קצר בעברית)"
}`;

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { inline_data: { mime_type: 'image/jpeg', data: base64 } },
          { text: prompt },
        ]}],
        generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
      }),
    });
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    const jsonStr = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    return JSON.parse(jsonStr);
  } catch (e) {
    return { sign_description: '', sign_type: '', sign_number_visible: null, what_driver_must_do: '', error: e.message };
  }
}

// Run N async tasks concurrently
async function runConcurrent(tasks, concurrency) {
  const results = new Array(tasks.length);
  let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const idx = i++;
      results[idx] = await tasks[idx]();
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

// ─── match by description ─────────────────────────────────────────────────────

function normalizeHe(text) {
  return (text || '').toLowerCase().replace(/['"״׳]/g, '').trim();
}

function matchByDescription(geminiResult, ourSigns) {
  const desc = normalizeHe(geminiResult.sign_description);
  const mustDo = normalizeHe(geminiResult.what_driver_must_do);
  const combined = desc + ' ' + mustDo;
  const words = combined.split(/\s+/).filter(w => w.length > 2);

  // Try sign number first
  if (geminiResult.sign_number_visible) {
    const num = String(geminiResult.sign_number_visible).trim();
    const byNum = ourSigns.find(s => s.image_filename === `${num}.png`);
    if (byNum) return { sign: byNum, method: `sign_number(${num})`, score: 100 };
  }

  // Keyword match against Hebrew name + explanation (from signs.json)
  let best = null, bestScore = 0;
  for (const sign of ourSigns) {
    const target = normalizeHe((sign.name_hebrew || '') + ' ' + (sign.explanation_amharic || ''));
    const score = words.filter(w => target.includes(w)).length;
    if (score > bestScore) { bestScore = score; best = sign; }
  }
  if (bestScore >= 2) return { sign: best, method: `keyword(${bestScore})`, score: bestScore * 15 };
  return null;
}

// ─── generate HTML report ────────────────────────────────────────────────────

function generateReport(results, ourSigns) {
  const matched = results.filter(r => r.match);
  const unmatched = results.filter(r => !r.match);

  const rows = results.map(r => {
    const sign = r.match?.sign;
    const imgPath = sign ? findOurImagePath(sign) : null;
    const ourImgRel = imgPath ? imgPath.replace(ROOT + '\\', '').replace(/\\/g, '/') : null;

    const statusColor = !r.match ? '#fff8e1' : '#e8f5e9';
    const statusIcon = !r.match ? '❓' : '✅';

    const qRows = r.motQuestions.map(q => {
      const answersHtml = (q.answers || []).map(a =>
        `<li style="color:${a.isCorrect ? '#1b5e20' : '#555'};font-weight:${a.isCorrect ? 'bold' : 'normal'}">${a.isCorrect ? '✓ ' : ''}${a.text}</li>`
      ).join('');
      return `<div class="mot-q"><div class="q-text"><strong>${q.id}.</strong> ${q.question}</div><ul class="answers">${answersHtml}</ul></div>`;
    }).join('');

    const geminiInfo = `
      <div class="gem-box">
        <div><strong>🤖 Gemini:</strong> ${r.gemini?.sign_description || '—'}</div>
        <div class="gem-type">${r.gemini?.sign_type || ''}</div>
        <div class="gem-action">${r.gemini?.what_driver_must_do || ''}</div>
        ${r.match ? `<div class="gem-match">↳ ${r.match.method}</div>` : ''}
      </div>`;

    const ourContent = sign ? `
      <div class="our-id">${sign.id}</div>
      <div class="our-name">${sign.name_amharic || ''}</div>
      <div class="our-exp">${sign.explanation_amharic?.substring(0, 150) || '—'}${(sign.explanation_amharic?.length || 0) > 150 ? '...' : ''}</div>
    ` : '<div style="color:#999">לא נמצאה התאמה</div>';

    const ourImgHtml = ourImgRel ? `<img src="../${ourImgRel}" class="sign-img our-img">` : '';

    return `
    <tr style="background:${statusColor}">
      <td class="img-cell">
        <img src="${r.motUrl}" class="sign-img" onerror="this.src=''">
        <div class="status-icon">${statusIcon}</div>
      </td>
      <td>${qRows}</td>
      <td>${geminiInfo}</td>
      <td class="img-cell">${ourImgHtml}</td>
      <td>${ourContent}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<title>השוואה לפי תמונות (Gemini) — MoT vs האפליקציה</title>
<style>
  body { font-family: Arial, sans-serif; margin: 16px; background: #f5f5f5; font-size: 13px; }
  h1 { color: #1a237e; }
  .summary { display: flex; gap: 12px; margin: 12px 0; flex-wrap: wrap; }
  .stat { background: white; border-radius: 8px; padding: 12px 20px; box-shadow: 0 2px 6px #0001; text-align: center; }
  .stat .num { font-size: 1.8em; font-weight: bold; color: #1565c0; }
  .stat .lbl { font-size: 11px; color: #666; }
  .filters { margin: 12px 0; display: flex; gap: 8px; align-items: center; }
  select, input { padding: 5px 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px #0001; }
  th { background: #1565c0; color: white; padding: 8px; text-align: right; }
  td { border-bottom: 1px solid #eee; vertical-align: top; padding: 8px; }
  tr:hover td { filter: brightness(0.97); }
  .img-cell { width: 110px; text-align: center; }
  .sign-img { max-width: 90px; max-height: 90px; border-radius: 4px; border: 1px solid #ddd; background: white; }
  .our-img { border: 2px solid #1565c0; }
  .status-icon { font-size: 18px; margin-top: 4px; }
  .mot-q { margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px dashed #eee; }
  .mot-q:last-child { border-bottom: none; }
  .q-text { font-weight: 500; margin-bottom: 3px; }
  .answers { margin: 0; padding-right: 16px; list-style: none; }
  .answers li { font-size: 11px; margin: 1px 0; }
  .gem-box { background: #f3f8ff; border-radius: 6px; padding: 6px 8px; font-size: 12px; }
  .gem-type { color: #1565c0; font-size: 11px; margin-top: 2px; }
  .gem-action { color: #333; font-size: 11px; margin-top: 2px; font-style: italic; }
  .gem-match { color: #2e7d32; font-size: 10px; margin-top: 4px; font-weight: bold; }
  .our-id { font-weight: bold; color: #1565c0; font-size: 11px; }
  .our-name { font-size: 12px; direction: ltr; }
  .our-exp { font-size: 11px; color: #555; direction: ltr; margin-top: 3px; }
</style>
</head>
<body>
<h1>🖼️ השוואה לפי תמונות (Gemini Vision) — MoT vs האפליקציה</h1>
<div class="summary">
  <div class="stat"><div class="num">${results.length}</div><div class="lbl">תמונות MoT</div></div>
  <div class="stat"><div class="num">${matched.length}</div><div class="lbl">הותאמו ✅</div></div>
  <div class="stat"><div class="num">${unmatched.length}</div><div class="lbl">לא הותאמו ❓</div></div>
  <div class="stat"><div class="num">${ourSigns.length}</div><div class="lbl">תמרורים שלנו</div></div>
</div>
<div class="filters">
  <select onchange="filterRows(this.value)">
    <option value="all">הכל</option>
    <option value="matched">הותאמו</option>
    <option value="unmatched">לא הותאמו</option>
  </select>
  <input type="text" placeholder="חיפוש..." oninput="searchRows(this.value)" style="width:200px">
</div>
<table>
<thead><tr>
  <th>תמונת MoT</th>
  <th>שאלה + תשובות</th>
  <th>זיהוי Gemini</th>
  <th>תמרור שלנו</th>
  <th>תוכן שלנו</th>
</tr></thead>
<tbody id="tbody">${rows}</tbody>
</table>
<script>
function filterRows(v) {
  document.querySelectorAll('#tbody tr').forEach(r => {
    const icon = r.querySelector('.status-icon')?.textContent?.trim();
    if (v==='all') r.style.display='';
    else if (v==='matched') r.style.display = icon==='✅' ? '' : 'none';
    else r.style.display = icon==='❓' ? '' : 'none';
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
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🤖 geminiMatchMoT.mjs — Gemini Vision Sign Matching');
  console.log('═'.repeat(60));

  const motAll = JSON.parse(readFileSync(join(OUTPUT_DIR, 'mot_questions.json'), 'utf8'));
  const ourSigns = JSON.parse(readFileSync(join(ROOT, 'content', 'signs.json'), 'utf8'));

  const motQs = motAll.filter(q => q.category === 'תמרורים' && q.imageUrl);
  const motImages = {};
  for (const q of motQs) {
    if (!motImages[q.imageUrl]) motImages[q.imageUrl] = [];
    motImages[q.imageUrl].push(q);
  }
  const uniqueUrls = Object.keys(motImages);
  console.log(`MoT images to process: ${uniqueUrls.length}`);

  // Load cache
  let cache = {};
  if (existsSync(CACHE_FILE)) {
    cache = JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
    console.log(`Cache loaded: ${Object.keys(cache).length} already identified`);
  }

  // ── Identify images with Gemini ──────────────────────────────────────────
  const toProcess = uniqueUrls.filter(url => !cache[url]);
  console.log(`\n🔍 Identifying ${toProcess.length} new images with Gemini...`);

  let done = 0;
  const tasks = toProcess.map(url => async () => {
    const fname = basename(url);
    const localPath = join(MOT_IMG_DIR, fname);
    if (!existsSync(localPath)) return;

    const buf = readFileSync(localPath);
    const result = await identifySignWithGemini(buf, fname);
    cache[url] = result;
    done++;
    if (done % 10 === 0 || done === toProcess.length) {
      process.stdout.write(`\r  ${done}/${toProcess.length} identified...`);
      // Save cache incrementally
      writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    }
  });

  await runConcurrent(tasks, CONCURRENCY);
  if (toProcess.length > 0) {
    console.log('');
    writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    console.log(`✅ Saved identifications to cache`);
  }

  // ── Match to our signs ───────────────────────────────────────────────────
  console.log('\n🔗 Matching to our signs...');
  const results = [];
  let matched = 0;

  for (const url of uniqueUrls) {
    const gemini = cache[url] || {};
    const match = matchByDescription(gemini, ourSigns);
    if (match) matched++;
    results.push({
      motUrl: url,
      motQuestions: motImages[url].map(q => ({
        id: q.questionId,
        question: q.questionText,
        correctAnswer: q.correctAnswer,
        answers: q.answers,
      })),
      gemini,
      match,
    });
  }
  console.log(`  ✅ Matched: ${matched}/${uniqueUrls.length}`);

  // ── Save JSON ────────────────────────────────────────────────────────────
  const jsonOut = results.map(r => ({
    motImageUrl: r.motUrl,
    matched: !!r.match,
    ourSignId: r.match?.sign?.id || null,
    geminiDescription: r.gemini?.sign_description || null,
    geminiType: r.gemini?.sign_type || null,
    geminiAction: r.gemini?.what_driver_must_do || null,
    matchMethod: r.match?.method || null,
    motQuestions: r.motQuestions,
    ourExplanation: r.match?.sign?.explanation_amharic?.substring(0, 100) || null,
  }));
  writeFileSync(join(OUTPUT_DIR, 'gemini_match_results.json'), JSON.stringify(jsonOut, null, 2));

  // ── Generate report ──────────────────────────────────────────────────────
  console.log('\n📄 Generating HTML report...');
  const html = generateReport(results, ourSigns);
  writeFileSync(join(OUTPUT_DIR, 'gemini_comparison_report.html'), html);

  console.log('\n' + '═'.repeat(60));
  console.log('🎉 Done!');
  console.log(`   Images identified : ${Object.keys(cache).length}`);
  console.log(`   Matched to our app: ${matched}/${uniqueUrls.length}`);
  console.log(`\n📂 Open: scripts/output/gemini_comparison_report.html`);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
