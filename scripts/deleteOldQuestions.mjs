/**
 * scripts/deleteOldQuestions.mjs
 *
 * Deletes outdated 3-answer questions from Supabase.
 * New questions have 4 answers. Old questions (3 answers) are leftover data
 * from before the content was updated. This script removes them.
 *
 * Run:
 *   node --env-file=.env scripts/deleteOldQuestions.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');

// ─── Load env ─────────────────────────────────────────────────────────────────
if (!process.env.EXPO_PUBLIC_SUPABASE_URL) {
  const envPath = join(ROOT, '.env');
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const [key, ...rest] = line.split('=');
      if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
    }
  }
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
                  || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌  Missing SUPABASE URL or KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔍  Fetching all questions from Supabase...');

  const { data: allQuestions, error: fetchError } = await supabase
    .from('questions')
    .select('id, answers');

  if (fetchError) {
    console.error('❌  Failed to fetch questions:', fetchError.message);
    process.exit(1);
  }

  console.log(`📦  Total questions in DB: ${allQuestions.length}`);

  // Find questions with fewer than 4 answers (old format)
  const oldIds = allQuestions
    .filter(q => {
      const answers = typeof q.answers === 'string'
        ? JSON.parse(q.answers)
        : q.answers;
      return Array.isArray(answers) && answers.length < 4;
    })
    .map(q => q.id);

  console.log(`🗑️   Found ${oldIds.length} old questions (< 4 answers) to delete`);
  console.log(`✅  Keeping ${allQuestions.length - oldIds.length} new questions (4 answers)`);

  if (oldIds.length === 0) {
    console.log('✅  Nothing to delete. DB is already clean.');
    return;
  }

  // Delete in batches of 100 to avoid URL length limits
  const BATCH = 100;
  let deleted = 0;
  for (let i = 0; i < oldIds.length; i += BATCH) {
    const batch = oldIds.slice(i, i + BATCH);
    const { error: delError } = await supabase
      .from('questions')
      .delete()
      .in('id', batch);

    if (delError) {
      console.error(`❌  Error deleting batch ${i}–${i + BATCH}:`, delError.message);
    } else {
      deleted += batch.length;
      console.log(`   Deleted ${deleted}/${oldIds.length}...`);
    }
  }

  console.log(`\n✅  Done! Deleted ${deleted} old questions.`);
  console.log(`📊  DB now has ${allQuestions.length - deleted} questions (all with 4 answers).`);
}

main().catch(err => {
  console.error('❌  Unexpected error:', err);
  process.exit(1);
});
