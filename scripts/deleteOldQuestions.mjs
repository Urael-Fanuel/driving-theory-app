/**
 * scripts/deleteOldQuestions.mjs
 *
 * Deletes questions from Supabase DB for a specific range of sign numbers.
 *
 * Usage:
 *   node --env-file=.env scripts/deleteOldQuestions.mjs --from=301 --to=310
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
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
                  || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌  Missing SUPABASE URL or KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Args ─────────────────────────────────────────────────────────────────────
const fromArg = process.argv.find(a => a.startsWith('--from='));
const toArg   = process.argv.find(a => a.startsWith('--to='));

if (!fromArg || !toArg) {
  console.error('❌  Usage: node --env-file=.env scripts/deleteOldQuestions.mjs --from=301 --to=310');
  process.exit(1);
}

const fromNum = parseInt(fromArg.split('=')[1]);
const toNum   = parseInt(toArg.split('=')[1]);

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Build list of all question IDs for this range (3 per sign)
  const ids = [];
  for (let n = fromNum; n <= toNum; n++) {
    ids.push(`${n}_q1`, `${n}_q2`, `${n}_q3`);
  }

  console.log(`\n🗑️   Deleting questions for signs ${fromNum}–${toNum} (${ids.length} IDs)...`);
  console.log(`     IDs: ${ids.join(', ')}`);

  const { error } = await supabase
    .from('questions')
    .delete()
    .in('id', ids);

  if (error) {
    console.error(`❌  Delete failed: ${error.message}`);
    process.exit(1);
  }

  console.log(`✅  Done! Deleted questions for signs ${fromNum}–${toNum} from DB.`);
}

main().catch(err => {
  console.error('❌  Unexpected error:', err);
  process.exit(1);
});
