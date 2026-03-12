/**
 * scripts/restoreSignsFromSupabase.mjs
 *
 * משחזר תמרורים 101–105 מסופרבייס → signs.json
 * כולל: name_amharic, explanation_amharic, question_amharic, כל 4 תשובות
 *
 * הרצה:
 *   node --env-file=.env scripts/restoreSignsFromSupabase.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SIGNS_JSON = join(ROOT, 'content', 'signs.json');

// ── Load env ───────────────────────────────────────────────────────────────────
if (!process.env.EXPO_PUBLIC_SUPABASE_URL) {
  const envPath = join(ROOT, '.env');
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const eq = line.indexOf('=');
      if (eq < 1) continue;
      const k = line.slice(0, eq).trim();
      const v = line.slice(eq + 1).trim();
      if (k && !(k in process.env)) process.env[k] = v;
    }
  }
}

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Load signs.json ────────────────────────────────────────────────────────────
const raw = readFileSync(SIGNS_JSON, 'utf8');
const stripped = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
const allSigns = JSON.parse(stripped);

// ── Signs 101–105 ─────────────────────────────────────────────────────────────
const targetSigns = allSigns.filter(s => {
  const n = parseInt(s.image_filename);
  return n >= 101 && n <= 105;
});

console.log(`\n🔄 משחזר ${targetSigns.length} תמרורים (101–105) מסופרבייס...\n`);

let restored = 0;

for (const sign of targetSigns) {
  // Fetch sign fields from Supabase
  const { data: dbSign, error: signErr } = await supabase
    .from('signs')
    .select('id, name_amharic, explanation_amharic')
    .eq('id', sign.id)
    .single();

  if (signErr || !dbSign) {
    console.log(`  ⚠️  sign ${sign.id}: ${signErr?.message}`);
    continue;
  }

  // Fetch questions + answers from Supabase
  const { data: dbQuestions, error: qErr } = await supabase
    .from('questions')
    .select('id, question_amharic, answers')
    .eq('sign_id', sign.id);

  if (qErr) {
    console.log(`  ⚠️  questions for ${sign.id}: ${qErr.message}`);
    continue;
  }

  // Update signs.json entry
  const idx = allSigns.findIndex(s => s.id === sign.id);
  if (idx === -1) continue;

  allSigns[idx].name_amharic = dbSign.name_amharic || '';
  allSigns[idx].explanation_amharic = dbSign.explanation_amharic || '';

  // Restore all questions + all 4 answers
  if (dbQuestions && dbQuestions.length > 0) {
    for (const dbQ of dbQuestions) {
      const qi = allSigns[idx].questions?.findIndex(q => q.id === dbQ.id);
      if (qi === undefined || qi === -1) continue;

      allSigns[idx].questions[qi].question_amharic = dbQ.question_amharic || '';
      // Replace answers entirely with what's in Supabase (including D)
      if (Array.isArray(dbQ.answers) && dbQ.answers.length > 0) {
        allSigns[idx].questions[qi].answers = dbQ.answers;
      }
    }
  }

  console.log(`  ✅  ${parseInt(sign.image_filename)} — שוחזר`);
  restored++;
}

writeFileSync(SIGNS_JSON, JSON.stringify(allSigns, null, 2), 'utf8');
console.log(`\n🎉 שחזור הושלם — ${restored} תמרורים עודכנו ב-signs.json\n`);
