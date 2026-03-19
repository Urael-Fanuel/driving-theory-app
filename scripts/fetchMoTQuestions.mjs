/**
 * fetchMoTQuestions.mjs
 * Downloads all MoT driving theory questions, parses them, and generates
 * a comparison report against our signs.json content.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUTPUT_DIR = join(__dirname, 'output');
mkdirSync(OUTPUT_DIR, { recursive: true });

// Hebrew MoT API (1802 questions)
const HE_RESOURCE_ID = 'bf7cb748-f220-474b-a4d5-2d59f93db28d';
// English MoT API (1803 questions) — fallback
const EN_RESOURCE_ID = '9a197011-adf9-45a2-81b9-d17dabdf990b';
const API_BASE = 'https://data.gov.il/api/3/action/datastore_search';
const BATCH_SIZE = 100;

// ─── helpers ────────────────────────────────────────────────────────────────

function parseDescription(html) {
  if (!html) return { answers: [], correctAnswer: '', imageUrl: null };

  // Extract all answer spans
  const answerRegex = /<span(?:\s+id="(correctAnswer\d+)")?[^>]*>([\s\S]*?)<\/span>/g;
  const answers = [];
  let correctAnswer = '';
  let m;
  while ((m = answerRegex.exec(html)) !== null) {
    const isCorrect = !!m[1];
    const text = m[2].replace(/<[^>]+>/g, '').trim();
    if (!text || text.length < 2) continue;
    answers.push({ text, isCorrect });
    if (isCorrect) correctAnswer = text;
  }

  // Extract image URL
  const imgMatch = html.match(/src="(https?:\/\/[^"]+\.jpg)"/i);
  const imageUrl = imgMatch ? imgMatch[1] : null;

  return { answers: answers.slice(0, 4), correctAnswer, imageUrl };
}

function parseQuestionId(title) {
  const m = title.match(/^(\d{4})\./);
  return m ? m[1] : null;
}

function parseQuestionText(title) {
  return title.replace(/^\d{4}\.\s*/, '').trim();
}

// ─── fetch all questions ─────────────────────────────────────────────────────

async function fetchAllQuestions(resourceId) {
  let total = null;
  let offset = 0;
  const all = [];

  while (true) {
    const url = `${API_BASE}?resource_id=${resourceId}&limit=${BATCH_SIZE}&offset=${offset}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for offset ${offset}`);
    const data = await res.json();
    if (!data.success) throw new Error(`API error: ${JSON.stringify(data.error)}`);

    const records = data.result.records;
    if (total === null) total = data.result.total;
    all.push(...records);

    process.stdout.write(`\r  Fetched ${all.length}/${total} records...`);
    if (all.length >= total || records.length === 0) break;
    offset += BATCH_SIZE;
    await new Promise(r => setTimeout(r, 200)); // be nice to the server
  }
  console.log('');
  return all;
}

// ─── load our signs ──────────────────────────────────────────────────────────

function loadOurSigns() {
  const raw = readFileSync(join(ROOT, 'content', 'signs.json'), 'utf8');
  return JSON.parse(raw);
}

// ─── match MoT question to our sign ─────────────────────────────────────────

function matchToOurSign(motQ, ourSigns) {
  // Strategy 1: match by TQ_PIC image number
  // TQ_PIC_3580.jpg → questionId = 580 → look for sign with image_filename "580.png" or number_in_name
  if (motQ.imageUrl) {
    const picMatch = motQ.imageUrl.match(/TQ_PIC_(\d+)\.jpg/i);
    if (picMatch) {
      const picNum = parseInt(picMatch[1]);
      // Pattern: TQ_PIC_3580 → sign number = picNum - 3000 (if result is 100-935)
      // But also try: picNum - 30000, picNum directly
      const candidates = [picNum - 3000, picNum - 30000, picNum].filter(n => n >= 100 && n <= 999);
      for (const num of candidates) {
        const found = ourSigns.find(s => s.image_filename === `${num}.png`);
        if (found) return { sign: found, matchMethod: `TQ_PIC_${picNum}→sign_${num}` };
      }
    }
  }

  // Strategy 2: keyword match in question text vs Hebrew sign name
  const qWords = motQ.questionText.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  let bestScore = 0;
  let bestSign = null;
  for (const sign of ourSigns) {
    if (!sign.name_hebrew) continue;
    const hWords = sign.name_hebrew.toLowerCase().split(/\s+/);
    const score = qWords.filter(w => hWords.some(h => h.includes(w) || w.includes(h))).length;
    if (score > bestScore) { bestScore = score; bestSign = sign; }
  }
  if (bestScore >= 2) return { sign: bestSign, matchMethod: `keyword(score=${bestScore})` };

  return null;
}

// ─── generate HTML report ────────────────────────────────────────────────────

function generateReport(motQuestions, ourSigns) {
  const trafficSignQs = motQuestions.filter(q => q.category === 'Traffic Signs');
  const matched = motQuestions.filter(q => q.match);
  const unmatched = trafficSignQs.filter(q => !q.match);

  const rows = motQuestions.map(q => {
    const sign = q.match?.sign;
    const ourExplanation = sign ? (sign.explanation_amharic || '—') : '—';
    const statusIcon = !q.match ? '❓' : '✅';
    const bgColor = !q.match ? '#fff8e1' : '#f1f8e9';

    const answersHtml = q.answers.map(a =>
      `<li style="color:${a.isCorrect ? 'green' : '#555'};font-weight:${a.isCorrect ? 'bold' : 'normal'}">${a.isCorrect ? '✓ ' : ''}${a.text}</li>`
    ).join('');

    const imgHtml = q.imageUrl
      ? `<img src="${q.imageUrl}" style="max-height:80px;border-radius:4px;margin-top:4px">`
      : '';

    return `
    <tr style="background:${bgColor}">
      <td style="padding:8px;font-size:12px;color:#666">${q.questionId}</td>
      <td style="padding:8px">
        <strong>${q.questionText}</strong>
        ${imgHtml}
        <ul style="margin:4px 0;padding-left:16px;font-size:12px">${answersHtml}</ul>
      </td>
      <td style="padding:8px;font-size:11px;color:#888">${q.category}</td>
      <td style="padding:8px;font-size:12px">
        ${sign ? `<strong>${sign.id}</strong><br><span style="color:#666">${sign.name_hebrew || ''}</span>` : '—'}
        ${q.match ? `<br><small style="color:#999">${q.match.matchMethod}</small>` : ''}
      </td>
      <td style="padding:8px;font-size:11px;color:#444;direction:ltr">${ourExplanation.substring(0, 120)}${ourExplanation.length > 120 ? '...' : ''}</td>
      <td style="padding:8px;font-size:18px;text-align:center">${statusIcon}</td>
    </tr>`;
  }).join('');

  const categoryBreakdown = {};
  for (const q of motQuestions) {
    categoryBreakdown[q.category] = (categoryBreakdown[q.category] || 0) + 1;
  }
  const catRows = Object.entries(categoryBreakdown)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, count]) => `<tr><td>${cat}</td><td>${count}</td></tr>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
<title>השוואה: שאלות האפליקציה מול משרד התחבורה</title>
<style>
  body { font-family: Arial, sans-serif; margin: 20px; background: #fafafa; }
  h1 { color: #1a237e; }
  .summary { display: flex; gap: 20px; margin: 20px 0; flex-wrap: wrap; }
  .stat-card { background: white; border-radius: 8px; padding: 16px 24px; box-shadow: 0 2px 8px #0001; text-align: center; min-width: 140px; }
  .stat-card .num { font-size: 2em; font-weight: bold; color: #1565c0; }
  .stat-card .label { font-size: 13px; color: #666; }
  table { width: 100%; border-collapse: collapse; background: white; box-shadow: 0 2px 8px #0001; border-radius: 8px; overflow: hidden; }
  th { background: #1565c0; color: white; padding: 10px 8px; text-align: right; font-size: 13px; }
  td { border-bottom: 1px solid #eee; vertical-align: top; }
  tr:hover td { background: #e3f2fd !important; }
  .filters { margin: 16px 0; display: flex; gap: 10px; align-items: center; }
  select, input { padding: 6px 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 13px; }
  .cat-table { width: auto; margin: 0 0 20px 0; }
  .cat-table td, .cat-table th { padding: 6px 12px; }
</style>
</head>
<body>
<h1>📊 השוואה: שאלות האפליקציה מול בנק השאלות הרשמי של משרד התחבורה</h1>

<div class="summary">
  <div class="stat-card"><div class="num">${motQuestions.length}</div><div class="label">סה"כ שאלות MoT<br>בדוח</div></div>
  <div class="stat-card"><div class="num">${trafficSignQs.length}</div><div class="label">שאלות בקטגוריית<br>תמרורים</div></div>
  <div class="stat-card"><div class="num">${matched.length}</div><div class="label">הותאמו לתמרורינו ✅</div></div>
  <div class="stat-card"><div class="num">${unmatched.length}</div><div class="label">לא הותאמו ❓</div></div>
  <div class="stat-card"><div class="num">${ourSigns.length}</div><div class="label">תמרורים באפליקציה</div></div>
</div>

<h2>התפלגות לפי קטגוריה (כל השאלות שהורדו)</h2>
<table class="cat-table">
  <tr><th>קטגוריה</th><th>כמות</th></tr>
  ${catRows}
</table>

<h2>שאלות תמרורים (Traffic Signs)</h2>
<div class="filters">
  <label>סנן: <select onchange="filterTable(this.value)">
    <option value="all">הכל</option>
    <option value="matched">הותאמו ✅</option>
    <option value="unmatched">לא הותאמו ❓</option>
  </select></label>
  <input type="text" placeholder="חיפוש חופשי..." oninput="searchTable(this.value)" style="width:200px">
</div>
<table id="mainTable">
<thead>
  <tr>
    <th style="width:60px">מ"מ ID</th>
    <th>שאלה + תשובות (אנגלית)</th>
    <th style="width:120px">קטגוריה</th>
    <th style="width:160px">תמרור שלנו</th>
    <th style="width:200px">ההסבר שלנו (אמהרית)</th>
    <th style="width:50px">סטטוס</th>
  </tr>
</thead>
<tbody id="tableBody">
${rows}
</tbody>
</table>

<script>
function filterTable(val) {
  const rows = document.querySelectorAll('#tableBody tr');
  rows.forEach(row => {
    const icon = row.cells[5].textContent.trim();
    if (val === 'all') row.style.display = '';
    else if (val === 'matched') row.style.display = icon === '✅' ? '' : 'none';
    else if (val === 'unmatched') row.style.display = icon === '❓' ? '' : 'none';
  });
}
function searchTable(val) {
  const rows = document.querySelectorAll('#tableBody tr');
  const q = val.toLowerCase();
  rows.forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}
</script>
</body>
</html>`;
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🤖 fetchMoTQuestions.mjs');
  console.log('═'.repeat(60));

  // 1. Fetch all questions — try Hebrew first, fallback to English
  let rawRecords;
  let language = 'Hebrew';
  try {
    console.log(`\n📥 Fetching Hebrew MoT questions...`);
    rawRecords = await fetchAllQuestions(HE_RESOURCE_ID);
  } catch (e) {
    console.log(`⚠️  Hebrew API failed (${e.message}), trying English...`);
    language = 'English';
    rawRecords = await fetchAllQuestions(EN_RESOURCE_ID);
  }
  console.log(`✅ Downloaded ${rawRecords.length} records (${language})`);

  // 2. Parse each record
  console.log('\n🔍 Parsing questions...');
  const parsed = rawRecords.map(r => {
    const { answers, correctAnswer, imageUrl } = parseDescription(r.description4);
    return {
      questionId: parseQuestionId(r.title2 || ''),
      questionText: parseQuestionText(r.title2 || ''),
      answers,
      correctAnswer,
      imageUrl,
      category: r.category || '',
    };
  }).filter(q => q.questionId && q.questionText);

  console.log(`  Parsed: ${parsed.length} valid questions`);

  // Save raw parsed data
  writeFileSync(
    join(OUTPUT_DIR, 'mot_questions.json'),
    JSON.stringify(parsed, null, 2),
    'utf8'
  );
  console.log(`  💾 Saved: scripts/output/mot_questions.json`);

  // 3. Filter to Traffic Signs only (Hebrew: תמרורים, English: Traffic Signs)
  const trafficSigns = parsed.filter(q => q.category === 'תמרורים' || q.category === 'Traffic Signs');
  console.log(`\n🚦 Traffic Signs questions: ${trafficSigns.length}`);

  // 4. Match to our signs
  const ourSigns = loadOurSigns();
  console.log(`📋 Our signs: ${ourSigns.length}`);

  console.log('\n🔗 Matching MoT questions to our signs...');
  for (const q of trafficSigns) {
    q.match = matchToOurSign(q, ourSigns);
  }
  const matchedCount = trafficSigns.filter(q => q.match).length;
  console.log(`  ✅ Matched: ${matchedCount}/${trafficSigns.length}`);

  // 5. Generate HTML report
  console.log('\n📄 Generating HTML report...');
  const html = generateReport(trafficSigns, ourSigns);
  const reportPath = join(OUTPUT_DIR, 'comparison_report.html');
  writeFileSync(reportPath, html, 'utf8');

  console.log('\n' + '═'.repeat(60));
  console.log('🎉 Done!');
  console.log(`   mot_questions.json  → ${parsed.length} questions`);
  console.log(`   Traffic Signs       → ${trafficSigns.length} questions`);
  console.log(`   Matched to our app  → ${matchedCount}`);
  console.log(`   Unmatched           → ${trafficSigns.length - matchedCount}`);
  console.log(`\n📂 Open the report: scripts/output/comparison_report.html`);
}

main().catch(e => { console.error('❌ Fatal:', e); process.exit(1); });
