/**
 * scripts/generateExplanationsWithGemini.mjs
 * Generates explanation_correct_amharic + explanation_wrong_amharic
 * for each question using Gemini AI.
 *
 * Usage:
 *   node --env-file=.env scripts/generateExplanationsWithGemini.mjs
 *   node --env-file=.env scripts/generateExplanationsWithGemini.mjs --sign-number 101 --limit 5
 *
 * Options:
 *   --sign-number N   Start from sign number N (image_filename = N.png)
 *   --limit N         Process at most N signs
 *   --force           Re-generate even if explanation already exists
 */

import { readFileSync, writeFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ─── Args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.findIndex(a => a === name || a.startsWith(name + '='));
  if (i === -1) return null;
  return args[i].includes('=') ? args[i].split('=')[1] : args[i + 1];
};
const START_NUM  = getArg('--sign-number') ? parseInt(getArg('--sign-number')) : 101;
const LIMIT      = getArg('--limit')       ? parseInt(getArg('--limit'))       : 999;
const FORCE      = args.includes('--force');

// ─── Config ───────────────────────────────────────────────────────────────────
const API_KEY    = process.env.GEMINI_API_KEY;
const MODEL      = 'gemini-2.5-flash';
const API_URL    = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
const DELAY_MS   = 8000;
const RETRY_MS   = 30000;
const MAX_RETRY  = 3;

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

if (!API_KEY) { console.error('❌ GEMINI_API_KEY לא מוגדר ב-.env'); process.exit(1); }

// ─── Prompt ───────────────────────────────────────────────────────────────────
function buildPrompt(sign, q) {
  const correctAnswer = q.answers.find(a => a.is_correct);
  const wrongAnswers  = q.answers.filter(a => !a.is_correct).map(a => a.text_amharic).filter(Boolean);

  return `You are an expert Amharic educator helping Ethiopian immigrants learn Israeli traffic signs.

Sign: ${sign.name_hebrew} (${sign.name_amharic || ''})
Question (Amharic): ${q.question_amharic || '(no question text yet)'}
Correct answer (Amharic): ${correctAnswer?.text_amharic || ''}
Wrong answers (Amharic): ${wrongAnswers.join(' / ')}

Write two SHORT explanations in clear, simple Amharic:
1. "explanation_correct" — Start with "ትክክል!" (Correct!), then briefly explain why this answer is right (max 2 sentences)
2. "explanation_wrong" — Start with "ስህተት!" (Wrong!), then say "ትክክለኛው መልስ:" (The correct answer is:) followed by the correct answer text exactly, then briefly explain why

Rules:
- Write in simple everyday Amharic, not technical jargon
- Keep each explanation under 30 Amharic words
- explanation_wrong MUST start with "ስህተት!" and include the correct answer text
- Return valid JSON only, no markdown

{
  "explanation_correct_amharic": "...",
  "explanation_wrong_amharic": "..."
}`;
}

// ─── Gemini call ──────────────────────────────────────────────────────────────
async function callGemini(sign, q, attempt = 1) {
  const body = {
    contents: [{ role: 'user', parts: [{ text: buildPrompt(sign, q) }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
  };

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    if (attempt < MAX_RETRY) {
      console.log(`  ⏳ retry ${attempt} after ${RETRY_MS/1000}s...`);
      await new Promise(r => setTimeout(r, RETRY_MS));
      return callGemini(sign, q, attempt + 1);
    }
    throw new Error(`HTTP ${res.status}: ${err.slice(0, 200)}`);
  }

  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  return JSON.parse(text);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const SIGNS_PATH = path.join(ROOT, 'content', 'signs.json');
const allSigns = JSON.parse(readFileSync(SIGNS_PATH, 'utf8'));

// Filter: warning signs 101-153, starting from START_NUM
const targets = allSigns
  .filter(s => {
    const n = parseInt(s.image_filename);
    return !isNaN(n) && n >= START_NUM && n >= 101 && n <= 153;
  })
  .sort((a, b) => parseInt(a.image_filename) - parseInt(b.image_filename))
  .slice(0, LIMIT);

console.log(`\n🤖 generateExplanationsWithGemini.mjs`);
console.log(`   מתחיל מתמרור ${START_NUM}, עד ${LIMIT} תמרורים`);
console.log(`   סה"כ לעבד: ${targets.length} תמרורים\n`);

let done = 0, skipped = 0, failed = 0;

for (const sign of targets) {
  const signNum = parseInt(sign.image_filename);
  console.log(`\n📍 תמרור ${signNum}: ${sign.name_hebrew}`);

  for (let qi = 0; qi < (sign.questions || []).length; qi++) {
    const q = sign.questions[qi];

    // Skip if already has explanations (unless --force)
    if (!FORCE && q.explanation_correct_amharic && q.explanation_wrong_amharic) {
      console.log(`  ⏭  שאלה ${qi+1}: כבר קיים הסבר — מדלג`);
      skipped++;
      continue;
    }

    console.log(`  🔄 שאלה ${qi+1}: מייצר הסבר...`);

    try {
      const result = await callGemini(sign, q);

      if (!result.explanation_correct_amharic || !result.explanation_wrong_amharic) {
        throw new Error('תשובה חסרה מג\'ימיני');
      }

      // Update signs.json in memory
      const sIdx = allSigns.findIndex(s => s.id === sign.id);
      allSigns[sIdx].questions[qi].explanation_correct_amharic = result.explanation_correct_amharic;
      allSigns[sIdx].questions[qi].explanation_wrong_amharic   = result.explanation_wrong_amharic;

      console.log(`  ✅ שאלה ${qi+1}: ✓ נכון: "${result.explanation_correct_amharic.slice(0,40)}..."`);
      done++;

      // Save signs.json after each question
      writeFileSync(SIGNS_PATH, JSON.stringify(allSigns, null, 2));

      // Delay between calls
      if (qi < sign.questions.length - 1) {
        await new Promise(r => setTimeout(r, DELAY_MS));
      }

    } catch (err) {
      console.log(`  ❌ שאלה ${qi+1}: ${err.message}`);
      failed++;
    }
  }

  // Delay between signs
  if (targets.indexOf(sign) < targets.length - 1) {
    await new Promise(r => setTimeout(r, DELAY_MS));
  }
}

console.log(`\n${'═'.repeat(55)}`);
console.log(`✅ הושלם: ${done} | ⏭ דולג: ${skipped} | ❌ נכשל: ${failed}`);
console.log(`\nהשלב הבא: הרץ generateAllAudio.ts ואז uploadNewAudio.mjs`);
