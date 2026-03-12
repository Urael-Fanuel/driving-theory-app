/**
 * scripts/fixDisplayOrder.mjs
 *
 * מעדכן את עמודת display_order בסופרבייס לכל תמרור ממוספר.
 * כל תמרור עם image_filename כמו "101.png" יקבל display_order = 101.
 *
 * הרצה:
 *   node --env-file=.env scripts/fixDisplayOrder.mjs
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname }           from 'path';
import { fileURLToPath }           from 'url';
import { createClient }            from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');

// ─── Load .env manually if needed ────────────────────────────────────────────
if (!process.env.EXPO_PUBLIC_SUPABASE_URL) {
  const envPath = join(ROOT, '.env');
  if (existsSync(envPath)) {
    readFileSync(envPath, 'utf8').split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eq = trimmed.indexOf('=');
      if (eq < 1) return;
      const k = trimmed.slice(0, eq).trim();
      const v = trimmed.slice(eq + 1).trim();
      if (k && !(k in process.env)) process.env[k] = v;
    });
  }
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌  Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── Load signs.json ──────────────────────────────────────────────────────────
const raw      = readFileSync(join(ROOT, 'content', 'signs.json'), 'utf8');
const stripped = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
const allSigns = JSON.parse(stripped);

// Filter: numbered signs only (image_filename = "NNN.png")
const numberedSigns = allSigns.filter(s =>
  s.image_filename && /^\d+\.png$/.test(s.image_filename)
);

console.log(`\n🔢  fixDisplayOrder.mjs`);
console.log(`${'═'.repeat(50)}`);
console.log(`תמרורים ממוספרים שנמצאו ב-signs.json: ${numberedSigns.length}`);
console.log(`(מתמרור 101 עד 152)\n`);

// ─── Update display_order in Supabase ─────────────────────────────────────────
let updated = 0;
let failed  = 0;

for (const sign of numberedSigns) {
  const officialNumber = parseInt(sign.image_filename); // e.g. 101 from "101.png"

  const { error } = await supabase
    .from('signs')
    .update({ display_order: officialNumber })
    .eq('id', sign.id);

  if (error) {
    console.log(`  ❌  נכשל: ${sign.id} (${officialNumber}) — ${error.message}`);
    failed++;
  } else {
    console.log(`  ✅  ${sign.id.padEnd(30)} display_order = ${officialNumber}`);
    updated++;
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(50)}`);
console.log(`🎉  סיום!`);
console.log(`   עודכנו בהצלחה : ${updated}`);
console.log(`   נכשלו          : ${failed}`);
console.log(`${'═'.repeat(50)}`);
console.log('\n📋  כעת רענן את ה-Table Editor בסופרבייס (F5).');
console.log('    סנן לפי topic_id = warning ומיין לפי display_order');
console.log('    תמרור 101 יופיע ראשון, 102 שני, וכן הלאה עד 152.\n');
