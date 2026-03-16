/**
 * scripts/deleteOldRightOfWaySigns.mjs
 *
 * מוחק מ-Supabase את 8 תמרורי זכות קדימה הישנים עם IDs סמנטיים.
 * אחרי המחיקה — הרץ uploadNewAudio.mjs --from=301 --to=310
 *
 * Run:
 *   node --env-file=.env scripts/deleteOldRightOfWaySigns.mjs
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ─── Load env ──────────────────────────────────────────────────────────────────
if (!process.env.EXPO_PUBLIC_SUPABASE_URL) {
  const envPath = join(ROOT, '.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
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

// ─── IDs ישנים למחיקה ──────────────────────────────────────────────────────────
const OLD_IDS = [
  'ROW_JUNCTION_YIELD',
  'ROW_ROUNDABOUT',
  'ROW_MAIN_ROAD',
  'ROW_YIELD_ONCOMING',
  'ROW_FOUR_WAY_STOP',
  'ROW_MERGE',
  'ROW_PRIORITY_ROAD',
  'ROW_END_PRIORITY',
];

console.log('\n🗑️   deleteOldRightOfWaySigns.mjs');
console.log('═'.repeat(55));
console.log(`IDs למחיקה: ${OLD_IDS.join(', ')}\n`);

// מחק questions קודם (FK constraint)
console.log('1️⃣  מוחק שאלות ישנות (questions table)...');
const { error: qErr, count: qCount } = await supabase
  .from('questions')
  .delete()
  .in('sign_id', OLD_IDS);

if (qErr) {
  console.error('❌  שגיאה במחיקת שאלות:', qErr.message);
} else {
  console.log(`   ✅  נמחקו שאלות עבור ${OLD_IDS.length} תמרורים\n`);
}

// מחק signs
console.log('2️⃣  מוחק תמרורים ישנים (signs table)...');
const { error: sErr } = await supabase
  .from('signs')
  .delete()
  .in('id', OLD_IDS);

if (sErr) {
  console.error('❌  שגיאה במחיקת תמרורים:', sErr.message);
} else {
  console.log(`   ✅  נמחקו ${OLD_IDS.length} תמרורים ישנים\n`);
}

console.log('═'.repeat(55));
console.log('✅  סיום! עכשיו הרץ:');
console.log('   node --env-file=.env scripts/uploadNewAudio.mjs --from=301 --to=310');
console.log('═'.repeat(55) + '\n');
