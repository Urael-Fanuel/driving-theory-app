/**
 * scripts/pullTranslationsFromSupabase.mjs
 *
 * Pulls Amharic translations from the Supabase `signs` table into signs.json.
 * Use this after manually editing name_amharic / explanation_amharic in
 * the Supabase Table Editor.
 *
 * For each sign where the text changed:
 *   - Updates signs.json
 *   - Deletes the old local MP3 file (so generateAllAudio.ts will regenerate it)
 *
 * Run:
 *   node --env-file=.env scripts/pullTranslationsFromSupabase.mjs
 *
 * Then:
 *   npx tsx scripts/generateAllAudio.ts
 *   node --env-file=.env scripts/uploadNewAudio.mjs
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');
const AUDIO_DIR = join(ROOT, 'assets', 'audio');
const SIGNS_JSON = join(ROOT, 'content', 'signs.json');

// ─── Load env ─────────────────────────────────────────────────────────────────
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

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌  Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── Main ─────────────────────────────────────────────────────────────────────
console.log('\n🔄  pullTranslationsFromSupabase.mjs');
console.log('═'.repeat(55));

// 1. Fetch all signs from Supabase
console.log('📡  Fetching signs from Supabase...');
const { data: dbSigns, error } = await supabase
  .from('signs')
  .select('id, name_amharic, explanation_amharic');

if (error) {
  console.error('❌  Failed to fetch signs:', error.message);
  process.exit(1);
}
console.log(`   Found ${dbSigns.length} signs in DB\n`);

// 2. Load local signs.json
const raw = readFileSync(SIGNS_JSON, 'utf8');
const stripped = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
const signsJson = JSON.parse(stripped);

// 3. Compare and update
let changedSigns = 0;
let deletedAudio = 0;
const changes = [];

for (const sign of signsJson) {
  const db = dbSigns.find(x => x.id === sign.id);
  if (!db) continue;

  let changed = false;

  // Check name_amharic
  if (db.name_amharic && db.name_amharic !== sign.name_amharic) {
    changes.push(`  📝  ${sign.id}: שם השתנה`);
    changes.push(`       לפני: ${sign.name_amharic}`);
    changes.push(`       אחרי: ${db.name_amharic}`);
    sign.name_amharic = db.name_amharic;

    // Delete old audio file so it gets regenerated
    if (sign.audio_name_filename) {
      const filePath = join(AUDIO_DIR, sign.audio_name_filename);
      if (existsSync(filePath)) {
        unlinkSync(filePath);
        deletedAudio++;
        changes.push(`       🗑️   נמחק: ${sign.audio_name_filename}`);
      }
    }
    changed = true;
  }

  // Check explanation_amharic
  if (db.explanation_amharic && db.explanation_amharic !== sign.explanation_amharic) {
    changes.push(`  📝  ${sign.id}: הסבר השתנה`);
    changes.push(`       לפני: ${sign.explanation_amharic}`);
    changes.push(`       אחרי: ${db.explanation_amharic}`);
    sign.explanation_amharic = db.explanation_amharic;

    // Delete old audio file so it gets regenerated
    if (sign.audio_explanation_filename) {
      const filePath = join(AUDIO_DIR, sign.audio_explanation_filename);
      if (existsSync(filePath)) {
        unlinkSync(filePath);
        deletedAudio++;
        changes.push(`       🗑️   נמחק: ${sign.audio_explanation_filename}`);
      }
    }
    changed = true;
  }

  if (changed) changedSigns++;
}

// 4. Print changes
if (changes.length > 0) {
  console.log('שינויים שנמצאו:');
  changes.forEach(c => console.log(c));
  console.log('');
} else {
  console.log('✅  אין שינויים — signs.json כבר מסונכרן עם Supabase.\n');
}

// 5. Save updated signs.json
if (changedSigns > 0) {
  writeFileSync(SIGNS_JSON, JSON.stringify(signsJson, null, 2), 'utf8');
  console.log(`✅  signs.json עודכן`);
}

// 6. Summary
console.log('═'.repeat(55));
console.log(`📊  סיכום:`);
console.log(`   תמרורים שהשתנו  : ${changedSigns}`);
console.log(`   קבצי אודיו נמחקו: ${deletedAudio}`);
console.log('═'.repeat(55));

if (changedSigns > 0) {
  console.log('\n▶️   עכשיו הרץ:');
  console.log('   npx tsx scripts/generateAllAudio.ts');
  console.log('   node --env-file=.env scripts/uploadNewAudio.mjs');
}
console.log('');
