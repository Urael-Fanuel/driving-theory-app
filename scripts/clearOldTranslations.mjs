/**
 * scripts/clearOldTranslations.mjs
 *
 * מוחק תרגומי Gemini ישנים מ-signs.json + Supabase עבור תמרורים 106–153.
 * לא נוגע ב-101–105.
 *
 * הרצה:
 *   node --env-file=.env scripts/clearOldTranslations.mjs
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

// ── Filter: only 106–153 ───────────────────────────────────────────────────────
const toClean = allSigns.filter(s => {
  const n = parseInt(s.image_filename);
  return n >= 106 && n <= 153;
});

console.log(`\n🧹 מוחק תרגומים עבור ${toClean.length} תמרורים (106–153)...\n`);

let localUpdated = 0;
let dbSignsUpdated = 0;
let dbQuestionsUpdated = 0;

// ── Clear locally in signs.json ───────────────────────────────────────────────
for (const sign of toClean) {
  const idx = allSigns.findIndex(s => s.id === sign.id);
  if (idx === -1) continue;

  allSigns[idx].name_amharic = '';
  allSigns[idx].explanation_amharic = '';

  if (Array.isArray(allSigns[idx].questions)) {
    for (const q of allSigns[idx].questions) {
      q.question_amharic = '';
      if (Array.isArray(q.answers)) {
        for (const a of q.answers) {
          a.text_amharic = '';
        }
      }
    }
  }
  localUpdated++;
}

writeFileSync(SIGNS_JSON, JSON.stringify(allSigns, null, 2), 'utf8');
console.log(`✅ signs.json עודכן — ${localUpdated} תמרורים נוקו`);

// ── Clear in Supabase: signs table ────────────────────────────────────────────
console.log('\n📝 מנקה Supabase...');
for (const sign of toClean) {
  const { error } = await supabase
    .from('signs')
    .update({ name_amharic: '', explanation_amharic: '' })
    .eq('id', sign.id);

  if (error) {
    console.log(`  ⚠️  signs: ${sign.id} — ${error.message}`);
  } else {
    dbSignsUpdated++;
  }
}
console.log(`✅ signs table — ${dbSignsUpdated} שורות נוקו`);

// ── Clear in Supabase: questions table ────────────────────────────────────────
for (const sign of toClean) {
  if (!Array.isArray(sign.questions)) continue;
  for (const q of sign.questions) {
    const clearedAnswers = (q.answers || []).map(a => ({ ...a, text_amharic: '' }));
    const { error } = await supabase
      .from('questions')
      .update({ question_amharic: '', answers: clearedAnswers })
      .eq('id', q.id);

    if (error) {
      console.log(`  ⚠️  question ${q.id} — ${error.message}`);
    } else {
      dbQuestionsUpdated++;
    }
  }
}
console.log(`✅ questions table — ${dbQuestionsUpdated} שאלות נוקו`);

console.log('\n🎉 סיום! תמרורים 106–153 נוקו לחלוטין.');
console.log('   תמרורים 101–105 לא נגענו.\n');
