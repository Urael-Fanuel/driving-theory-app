/**
 * scripts/checkSigns125126.mjs
 * Diagnostic: check what's actually in Supabase DB for signs 125 and 126
 * Run: node --env-file=.env scripts/checkSigns125126.mjs
 */

import { readFileSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');
const AUDIO_DIR = join(ROOT, 'assets', 'audio');

// Load env
if (!process.env.EXPO_PUBLIC_SUPABASE_URL) {
  const envPath = join(ROOT, '.env');
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 1) continue;
      const k = trimmed.slice(0, eq).trim();
      const v = trimmed.slice(eq + 1).trim();
      if (k && !(k in process.env)) process.env[k] = v;
    }
  }
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase     = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── Check DB signs ───────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════');
console.log('  DIAGNOSTIC: Signs 125 & 126 in Supabase DB');
console.log('═══════════════════════════════════════════════════\n');

for (const signId of ['SIGN_125', 'SIGN_126']) {
  console.log(`\n━━━ ${signId} ━━━`);

  // Fetch sign row
  const { data: sign, error: signErr } = await supabase
    .from('signs')
    .select('id, name_hebrew, name_amharic, explanation_amharic, audio_name_url, audio_explanation_url')
    .eq('id', signId)
    .single();

  if (signErr || !sign) {
    console.log(`  ❌ Sign not found in DB: ${signErr?.message}`);
    continue;
  }

  console.log(`  name_hebrew:       ${sign.name_hebrew}`);
  console.log(`  name_amharic:      ${sign.name_amharic?.slice(0, 80)}...`);
  console.log(`  explanation_amh:   ${sign.explanation_amharic?.slice(0, 80)}...`);
  console.log(`  audio_name_url:    ${sign.audio_name_url}`);
  console.log(`  audio_exp_url:     ${sign.audio_explanation_url}`);

  // Fetch questions
  const { data: questions, error: qErr } = await supabase
    .from('questions')
    .select('id, question_amharic, question_audio_url, explanation_correct_amharic, explanation_wrong_amharic, explanation_correct_audio_url, explanation_wrong_audio_url, answers')
    .eq('sign_id', signId)
    .order('id');

  if (qErr) {
    console.log(`  ❌ Questions error: ${qErr.message}`);
  } else {
    console.log(`  Questions in DB: ${questions?.length ?? 0}`);
    for (const q of (questions ?? [])) {
      console.log(`\n    [${q.id}]`);
      console.log(`      question:   ${q.question_amharic?.slice(0, 60)}`);
      console.log(`      q_audio_url: ${q.question_audio_url}`);
      console.log(`      exp_correct: ${q.explanation_correct_amharic?.slice(0, 60)}`);
      console.log(`      exp_audio_c: ${q.explanation_correct_audio_url}`);

      // Parse answers
      let answers = q.answers;
      if (typeof answers === 'string') answers = JSON.parse(answers);
      if (Array.isArray(answers)) {
        const correct = answers.find(a => a.is_correct);
        console.log(`      correct ans: [${correct?.id}] ${correct?.text_amharic?.slice(0, 60)}`);
        console.log(`      correct url: ${correct?.audio_url}`);
      }
    }
  }
}

// ─── Check local audio files ──────────────────────────────────────────────────
console.log('\n\n═══════════════════════════════════════════════════');
console.log('  LOCAL AUDIO FILES (size + modified date)');
console.log('═══════════════════════════════════════════════════\n');

const filesToCheck = [
  'sign_125_name.mp3', 'sign_125_explanation.mp3',
  '125_q1_question.mp3', '125_q1_correct.mp3', '125_q1_wrong.mp3',
  'sign_126_name.mp3', 'sign_126_explanation.mp3',
  '126_q1_question.mp3', '126_q1_correct.mp3', '126_q1_wrong.mp3',
];

for (const f of filesToCheck) {
  const p = join(AUDIO_DIR, f);
  if (existsSync(p)) {
    const stat = statSync(p);
    console.log(`  ✅ ${f.padEnd(35)} ${(stat.size / 1024).toFixed(1)}KB  ${stat.mtime.toISOString()}`);
  } else {
    console.log(`  ❌ MISSING: ${f}`);
  }
}

// Check for stale/duplicate file patterns
console.log('\n\n  CHECKING FOR STALE OLD FILENAMES:');
const stalePatterns = [
  'q_125_', 'q_126_', 'sign125_', 'sign126_',
  'answer_Q_SIGN_125', 'answer_Q_SIGN_126',
];
const audioDir = join(ROOT, 'assets', 'audio');
const { readdirSync } = await import('fs');
const allFiles = readdirSync(audioDir);
for (const pattern of stalePatterns) {
  const matches = allFiles.filter(f => f.includes(pattern));
  if (matches.length > 0) {
    console.log(`  ⚠️  Found stale files matching "${pattern}":`);
    matches.forEach(f => console.log(`       ${f}`));
  }
}
console.log('\n  Done.\n');
