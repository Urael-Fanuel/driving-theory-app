/**
 * fixMindSafetyTopic.mjs
 * 1. Prints all topics currently in Supabase (for diagnosis)
 * 2. Upserts mind_safety at display_order 11
 * 3. Fixes display_orders for all behavioral topics (11–16)
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

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

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Step 1: Print current state ───────────────────────────────────────────────
console.log('📋 נושאים קיימים בסופאבייס:');
const { data: existing, error: fetchErr } = await supabase
  .from('topics')
  .select('id, display_order, name_hebrew')
  .order('display_order');

if (fetchErr) {
  console.error('❌ שגיאה בקריאה:', fetchErr.message);
  process.exit(1);
}
for (const t of existing) {
  console.log(`  order=${t.display_order}  id=${t.id}  (${t.name_hebrew ?? ''})`);
}

// ── Step 2: Upsert mind_safety ────────────────────────────────────────────────
console.log('\n🔧 מוסיף / מעדכן mind_safety...');
const { error: upsertErr } = await supabase.from('topics').upsert({
  id:                  'mind_safety',
  name_amharic:        'አዕምሮ እና ደህንነት',
  name_hebrew:         'בטיחות נפשית',
  description_amharic: 'ትኩረት ማጣት፣ ምላሽ ጊዜ፣ ድካም እና አደጋ ለማወቅ።',
  icon:                '🧠',
  color:               '#1A237E',
  sign_count:          0,
  display_order:       11,
}, { onConflict: 'id' });

if (upsertErr) {
  console.error('❌ שגיאה ב-upsert:', upsertErr.message);
  process.exit(1);
}
console.log('  ✅ mind_safety → display_order 11');

// ── Step 3: Fix display_orders for all other behavioral topics ─────────────────
const fixes = [
  { id: 'basics_license', display_order: 16 },
  { id: 'two_wheelers',   display_order: 15 },
  { id: 'my_vehicle',     display_order: 14 },
  { id: 'the_road',       display_order: 13 },
  { id: 'society_law',    display_order: 12 },
];

console.log('\n🔧 מתקן display_order לשאר הנושאים...');
for (const fix of fixes) {
  const { error } = await supabase
    .from('topics')
    .update({ display_order: fix.display_order })
    .eq('id', fix.id);
  if (error) {
    console.error(`❌ שגיאה ב-${fix.id}:`, error.message);
  } else {
    console.log(`  ✅ ${fix.id} → display_order ${fix.display_order}`);
  }
}

// ── Step 4: Print final state ─────────────────────────────────────────────────
console.log('\n📋 מצב סופי:');
const { data: final } = await supabase
  .from('topics')
  .select('id, display_order, name_hebrew')
  .order('display_order');
for (const t of final) {
  console.log(`  order=${t.display_order}  id=${t.id}`);
}

console.log('\n✅ הכל תוקן!');
