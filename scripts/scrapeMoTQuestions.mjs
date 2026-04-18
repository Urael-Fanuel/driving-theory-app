/**
 * scrapeMoTQuestions.mjs
 * Fetches all "הכרת הרכב" questions from the Israeli Ministry of Transport
 * official question bank via their DataGov API.
 *
 * Usage: node scripts/scrapeMoTQuestions.mjs
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH   = join(__dirname, '..', 'content', 'mot_vehicle_questions.json');
const CATEGORY   = 'הכרת הרכב';

// IDs extracted from live Angular app on gov.il
const TEMPLATE_ID   = '7055a989-b7dc-47af-a1bb-a8194858a432';
const REPOSITORY_ID = 'bf7cb748-f220-474b-a4d5-2d59f93db28d';
const X_CLIENT_ID   = '149a5bad-edde-49a6-9fb9-188bd17d4788';
const PAGE_SIZE     = 10;
const TOTAL         = 110;

// ─── HTTPS helper ─────────────────────────────────────────────────────────────
function post(url, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const bodyBuf = Buffer.from(JSON.stringify(body));
    const parsed  = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      path:     parsed.pathname,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': bodyBuf.byteLength,
        'User-Agent':     'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer':        'https://www.gov.il/',
        'Origin':         'https://www.gov.il',
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8'))); }
        catch(e) { resolve(Buffer.concat(chunks).toString('utf-8')); }
      });
    });
    req.on('error', reject);
    req.write(bodyBuf);
    req.end();
  });
}

// ─── Parse text block → questions ─────────────────────────────────────────────
function parsePageText(rawText) {
  const questions = [];
  // Pattern: NNNN. question text ... תשובה answer1.answer2.answer3.answer4.הצג תשובה נכונה
  const blocks = rawText.split(/(?=\d{4}\. )/g).filter(b => b.match(/^\d{4}\./));

  for (const block of blocks) {
    const numMatch = block.match(/^(\d{4})\.\s+(.*?)(?:נושא הכרת הרכב.*?)?תשובה\s+(.*?)(?:הצג תשובה נכונה|$)/s);
    if (!numMatch) continue;

    const id       = numMatch[1];
    const question = numMatch[2].replace(/\s+/g, ' ').trim();
    const ansBlock = numMatch[3].replace(/\s+/g, ' ').trim();

    // Answers separated by periods at sentence boundaries
    // Pattern: text ending in period followed by capital or Hebrew
    const answers = ansBlock
      .split(/\.\s*(?=[א-ת\u05D0-\u05EA]|[A-Z]|לא |על |ב|ל|מ|ה|ו)/)
      .map(a => a.replace(/\.$/, '').trim())
      .filter(a => a.length > 3 && !a.includes('«') && !a.includes('הצג'));

    if (question && answers.length >= 2) {
      questions.push({ id, question, answers: answers.slice(0, 4) });
    }
  }
  return questions;
}

// ─── Main ──────────────────────────────────────────────────────────────────────
console.log(`\n📚 מוריד שאלות רשמיות — "${CATEGORY}"\n`);

const allQuestions = [];
const pages = Math.ceil(TOTAL / PAGE_SIZE); // 11 pages

// Try API approach — paginate until all 110 questions fetched
console.log('🔄 מנסה DataGov API עם pagination...');

function extractAnswers(desc, questionId) {
  if (!desc) return [];
  const html = desc.DescriptionHtmlString || desc.DescriptionBlankTextString || '';
  if (!html) return [];

  // Parse all <li><span ...>TEXT</span></li> items
  const answers = [];
  const liRe = /<li><span(?:[^>]*)>(.*?)<\/span><\/li>/gs;
  for (const m of html.matchAll(liRe)) {
    const text = m[1].replace(/<[^>]+>/g, '').trim();
    if (text && text.length > 1) answers.push({ text, is_correct: false });
  }

  // Mark correct answer — identified by id="correctAnswerNNNN"
  const correctRe = new RegExp(`id="correctAnswer${questionId}"[^>]*>(.*?)<\\/span>`, 's');
  const correctMatch = html.match(correctRe);
  if (correctMatch) {
    const correctText = correctMatch[1].replace(/<[^>]+>/g, '').trim();
    const idx = answers.findIndex(a => a.text === correctText);
    if (idx >= 0) answers[idx].is_correct = true;
    else if (correctText) answers.push({ text: correctText, is_correct: true });
  }

  return answers.slice(0, 4);
}

let apiWorked = false;
try {
  for (let from = 0; from < TOTAL; from += PAGE_SIZE) {
    process.stdout.write(`  📄 שאלות ${from + 1}–${from + PAGE_SIZE}... `);

    const apiResult = await post(
      'https://www.gov.il/he/api/DataGovProxy/GetDGResults',
      {
        DynamicTemplateID: TEMPLATE_ID,
        QueryFilters: { category: { Query: CATEGORY } },
        From: from,
        Size: PAGE_SIZE,
      },
      { 'X-Client-Id': X_CLIENT_ID }
    );

    const items = apiResult?.Results || apiResult?.results || apiResult?.Items || [];
    if (items.length === 0) { console.log('אין תוצאות — עוצר'); break; }

    // Debug: log first item structure once
    if (from === 0) {
      const sampleData = items[0]?.Data || items[0];
      console.log('\n  🔍 מבנה API (פריט ראשון):');
      console.log('    keys:', Object.keys(sampleData).join(', '));
      const d4 = sampleData.description4;
      console.log('    description4 type:', typeof d4, Array.isArray(d4) ? '(array len=' + d4.length + ')' : '');
      if (typeof d4 === 'object' && d4 !== null) console.log('    description4 keys:', Object.keys(d4).join(', '));
      process.stdout.write('  ');
    }

    let added = 0;
    for (const item of items) {
      const data    = item.Data || item.data || item;
      const title   = String(data.title2 || data.Title || '');
      const desc    = data.description4 || data.Description || '';
      const numMatch = title.match(/^(\d{4})\.\s+(.+)/s);
      if (numMatch && !allQuestions.find(q => q.id === numMatch[1])) {
        const qId = numMatch[1];
        allQuestions.push({
          id:       qId,
          question: numMatch[2].trim(),
          answers:  extractAnswers(desc, qId),
          category: CATEGORY,
        });
        added++;
      }
    }
    console.log(`✅ +${added}`);
    apiWorked = allQuestions.length > 0;
    await new Promise(r => setTimeout(r, 300));
  }
} catch(e) {
  console.log(`\n  ⚠️  API נכשל: ${e.message}`);
}

// If API didn't work — scrape page by page from public URL
if (!apiWorked || allQuestions.length < 10) {
  console.log('\n🔄 מנסה scraping עמוד אחר עמוד...');

  function getPage(skip) {
    return new Promise((resolve, reject) => {
      const catEncoded = encodeURIComponent(CATEGORY);
      const path = `/he/departments/dynamiccollectors/theoryexamhe_data?skip=${skip}&category=${catEncoded}`;
      https.get({
        hostname: 'www.gov.il',
        path,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache',
        }
      }, (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      }).on('error', reject);
    });
  }

  for (let page = 0; page < pages; page++) {
    const skip = page * PAGE_SIZE;
    process.stdout.write(`  עמוד ${page + 1}/${pages} (skip=${skip})... `);

    try {
      const html = await getPage(skip);

      // Extract text content from HTML
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim();

      const pageQuestions = parsePageText(text);

      // Deduplicate
      let added = 0;
      for (const q of pageQuestions) {
        if (!allQuestions.find(x => x.id === q.id)) {
          allQuestions.push({ ...q, category: CATEGORY });
          added++;
        }
      }
      console.log(`${added > 0 ? '✅' : '⚠️ '} ${added} שאלות`);

    } catch(e) {
      console.log(`❌ ${e.message}`);
    }

    await new Promise(r => setTimeout(r, 800));
  }
}

// ─── Save ──────────────────────────────────────────────────────────────────────
console.log(`\n📊 סה"כ: ${allQuestions.length} שאלות`);

if (allQuestions.length === 0) {
  console.error('❌ לא נמצאו שאלות');
  process.exit(1);
}

// Sort by question number
allQuestions.sort((a, b) => parseInt(a.id) - parseInt(b.id));

writeFileSync(OUT_PATH, JSON.stringify({
  category: CATEGORY,
  total: allQuestions.length,
  scraped_at: new Date().toISOString(),
  questions: allQuestions,
}, null, 2), 'utf-8');

console.log(`✅ נשמר: content/mot_vehicle_questions.json`);
console.log('\nדוגמה — שאלה ראשונה:');
const sample = allQuestions[0];
console.log(`  [${sample.id}] ${sample.question}`);
sample.answers.forEach((a, i) => {
  const mark = a.is_correct ? ' ✅ נכון' : '';
  console.log(`    ${i+1}. ${a.text}${mark}`);
});

// Stats
const withAnswers = allQuestions.filter(q => q.answers.length > 0).length;
const withCorrect = allQuestions.filter(q => q.answers.some(a => a.is_correct)).length;
console.log(`\n📈 סטטיסטיקות:`);
console.log(`   עם תשובות: ${withAnswers}/${allQuestions.length}`);
console.log(`   עם תשובה נכונה מסומנת: ${withCorrect}/${allQuestions.length}`);
