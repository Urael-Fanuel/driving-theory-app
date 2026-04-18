/**
 * groupMoTQuestions.mjs
 *
 * Uses Gemini to map each of the 110 official MoT "הכרת הרכב" questions
 * to the most relevant sub-topic in our scaffold.
 *
 * Output: content/mot_questions_grouped.json
 *   { "vk_l1_s1": { subtopic, questions: [...] }, ... }
 *
 * Usage: node --env-file=.env scripts/groupMoTQuestions.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const ROOT       = join(__dirname, '..');
const QS_PATH    = join(ROOT, 'content', 'mot_vehicle_questions.json');
const SCAF_PATH  = join(ROOT, 'content', 'vehicle_knowledge_scaffold.json');
const OUT_PATH   = join(ROOT, 'content', 'mot_questions_grouped.json');
const GEMINI_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_KEY) { console.error('❌ Missing GEMINI_API_KEY'); process.exit(1); }

// ─── Load data ─────────────────────────────────────────────────────────────────
const { questions } = JSON.parse(readFileSync(QS_PATH, 'utf8'));
const scaffold      = JSON.parse(readFileSync(SCAF_PATH, 'utf8'));

// Build flat list of sub-topics
const subtopics = [];
for (const level of scaffold.levels) {
  for (const sub of level.subtopics) {
    subtopics.push({ id: sub.id, name: sub.name_hebrew, level: level.level, levelName: level.name_hebrew });
  }
}

console.log(`\n📚 ${questions.length} שאלות + ${subtopics.length} נושאים`);
console.log('🤖 Gemini ממפה שאלות לנושאים...\n');

// ─── Gemini helper ─────────────────────────────────────────────────────────────
function geminiPost(body) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(JSON.stringify(body));
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': buf.byteLength },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8'))); }
        catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

// ─── Build mapping in batches of 30 ───────────────────────────────────────────
const subtopicList = subtopics
  .map(s => `  "${s.id}": "${s.levelName} → ${s.name}"`)
  .join('\n');

const BATCH_SIZE = 10;
const mapping    = {}; // questionId → subtopicId

for (let i = 0; i < questions.length; i += BATCH_SIZE) {
  const batch    = questions.slice(i, i + BATCH_SIZE);
  const batchNum = Math.floor(i / BATCH_SIZE) + 1;
  const total    = Math.ceil(questions.length / BATCH_SIZE);

  process.stdout.write(`  📦 אצווה ${batchNum}/${total} (שאלות ${i+1}–${i+batch.length})... `);

  const questionList = batch
    .map(q => `  "${q.id}": "${q.question}"`)
    .join('\n');

  const prompt = `\
You are mapping official Israeli Ministry of Transport "הכרת הרכב" (vehicle knowledge) exam questions
to educational sub-topics in a learning app.

SUB-TOPICS (id: level → name):
${subtopicList}

QUESTIONS TO MAP (id: question text):
${questionList}

For each question, choose the SINGLE most relevant sub-topic id.
If no sub-topic fits well, use the closest match.

Return valid JSON only (no markdown):
{
  "QNUM": "subtopic_id",
  "QNUM": "subtopic_id",
  ...
}`;

  try {
    const raw     = await geminiPost({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
    });

    if (raw.error) throw new Error(`API error ${raw.error.code}: ${raw.error.message}`);
    if (!raw.candidates) {
      console.log('\n  🔍 raw keys:', Object.keys(raw));
      console.log('  🔍 raw snippet:', JSON.stringify(raw).substring(0, 300));
      throw new Error('No candidates');
    }
    const text  = raw.candidates[0]?.content?.parts?.[0]?.text ?? '';
    const finishReason = raw.candidates[0]?.finishReason;
    if (!text) {
      console.log('\n  🔍 finishReason:', finishReason);
      console.log('  🔍 candidate:', JSON.stringify(raw.candidates[0]).substring(0, 200));
      throw new Error('Empty text');
    }
    const start = text.indexOf('{');
    const end   = text.lastIndexOf('}');
    if (start < 0 || end <= start) {
      console.log('\n  🔍 text preview:', text.substring(0, 300));
      throw new Error('No JSON in response');
    }

    const batchMapping = JSON.parse(text.substring(start, end + 1));
    let count = 0;
    for (const [qId, subId] of Object.entries(batchMapping)) {
      if (subtopics.find(s => s.id === subId)) {
        mapping[qId] = subId;
        count++;
      }
    }
    console.log(`✅ ${count} ממופות`);
  } catch(e) {
    console.error(`❌ ${e.message}`);
  }

  await new Promise(r => setTimeout(r, 500));
}

// ─── Build grouped output ──────────────────────────────────────────────────────
console.log('\n📊 מקבץ לפי נושאים...');

const grouped = {};

// Initialize all sub-topics (even empty ones)
for (const s of subtopics) {
  grouped[s.id] = {
    subtopic_id:   s.id,
    subtopic_name: s.name,
    level:         s.level,
    level_name:    s.levelName,
    questions:     [],
  };
}

// Fill questions
let mapped = 0, unmapped = 0;
for (const q of questions) {
  const subId = mapping[q.id];
  if (subId && grouped[subId]) {
    grouped[subId].questions.push(q);
    mapped++;
  } else {
    unmapped++;
    console.log(`  ⚠️  לא ממופה: [${q.id}] ${q.question.substring(0, 50)}`);
  }
}

// ─── Save ──────────────────────────────────────────────────────────────────────
writeFileSync(OUT_PATH, JSON.stringify(grouped, null, 2), 'utf-8');

console.log(`\n✅ נשמר: content/mot_questions_grouped.json`);
console.log(`   ממופות: ${mapped} | לא ממופות: ${unmapped}`);
console.log('\n📋 שאלות לכל נושא:');
for (const [id, g] of Object.entries(grouped)) {
  if (g.questions.length > 0) {
    console.log(`  ${id} (${g.subtopic_name}): ${g.questions.length} שאלות`);
  }
}

const empty = Object.values(grouped).filter(g => g.questions.length === 0);
if (empty.length > 0) {
  console.log(`\n⚠️  נושאים ללא שאלות (${empty.length}):`);
  empty.forEach(g => console.log(`  ${g.subtopic_id}: ${g.subtopic_name}`));
}
