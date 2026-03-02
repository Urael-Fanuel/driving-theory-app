/**
 * Patch: Populate audio_url for every answer in every question.
 *
 * The answer audio files were uploaded to Supabase Storage, but the
 * questions table still has audio_url: null in the answers JSONB because
 * the DB was seeded before those files were available.
 *
 * This script constructs the correct Storage URL for each answer and
 * upserts the questions table to fix it.
 *
 * Run once:
 *   npx tsx backend/patchAnswerAudio.ts
 */

import * as fs   from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

// ─── Load .env ────────────────────────────────────────────────────────────────
(function loadDotEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  }
})();

const SUPABASE_URL         = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error(
      '❌ Missing env vars.\n' +
      '   Need: EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'
    );
    process.exit(1);
  }

  const AUDIO_BASE = `${SUPABASE_URL}/storage/v1/object/public/audio`;
  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Fetch all questions
  console.log('📥 Fetching all questions from Supabase...');
  const { data: questions, error: fetchErr } = await client
    .from('questions')
    .select('*');

  if (fetchErr || !questions) {
    console.error('❌ Failed to fetch questions:', fetchErr?.message);
    process.exit(1);
  }

  console.log(`   Found ${questions.length} questions`);

  // Build patch rows — add audio_url to every answer
  let alreadyPatched = 0;
  const patchRows = questions.map((q: any) => {
    const answers = typeof q.answers === 'string'
      ? JSON.parse(q.answers)
      : q.answers as any[];

    // Check if already has audio_url
    const hasAudio = answers.some((a: any) => !!a.audio_url);
    if (hasAudio) alreadyPatched++;

    const patchedAnswers = answers.map((a: any) => ({
      ...a,
      audio_url: `${AUDIO_BASE}/answer_${q.id}_${a.id}.mp3`,
    }));

    return { ...q, answers: patchedAnswers };
  });

  if (alreadyPatched === questions.length) {
    console.log('✅ All questions already have audio_url — nothing to patch.');
    return;
  }

  console.log(`🔧 Patching ${patchRows.length - alreadyPatched} questions (${alreadyPatched} already have audio)...`);
  console.log(`   URL pattern: ${AUDIO_BASE}/answer_Q_XXX_NNN_A.mp3`);

  // Upsert in batches of 20
  const BATCH = 20;
  let updated = 0;

  for (let i = 0; i < patchRows.length; i += BATCH) {
    const batch = patchRows.slice(i, i + BATCH);
    const { error: upsertErr } = await client
      .from('questions')
      .upsert(batch, { onConflict: 'id' });

    if (upsertErr) {
      console.error(`   ❌ Batch ${i}–${i + BATCH} failed: ${upsertErr.message}`);
    } else {
      updated += batch.length;
      console.log(`   ✅ Patched ${updated} / ${patchRows.length}`);
    }
  }

  console.log(`\n🎉 Done! Patched ${updated} questions with answer audio URLs.`);
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
