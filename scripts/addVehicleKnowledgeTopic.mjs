/**
 * addVehicleKnowledgeTopic.mjs
 * 1. Shifts existing 6 behavioral topics display_order +1 (10→11 ... 15→16)
 * 2. Adds "הכרת הרכב" at display_order 10
 * 3. Renames "my_vehicle" → "נהיגה נכונה"
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

// Step 1: Shift existing 6 behavioral topics display_order +1
const topicsToShift = [
  { id: 'mind_safety',    display_order: 11 },
  { id: 'society_law',    display_order: 12 },
  { id: 'the_road',       display_order: 13 },
  { id: 'my_vehicle',     display_order: 14, name_hebrew: 'נהיגה נכונה', name_amharic: 'ትክክለኛ አነዳድ', description_amharic: 'ትክክለኛ ርቀት መጠበቅ፣ ቁልቁል እና ወደ ላይ ሹፌርነት፣ ፍጥነት ቁጥጥር።' },
  { id: 'two_wheelers',   display_order: 15 },
  { id: 'basics_license', display_order: 16 },
];

console.log('שלב 1: מזיז 6 נושאים קיימים...');
for (const t of topicsToShift) {
  const updateData = { display_order: t.display_order };
  if (t.name_hebrew)       updateData.name_hebrew       = t.name_hebrew;
  if (t.name_amharic)      updateData.name_amharic      = t.name_amharic;
  if (t.description_amharic) updateData.description_amharic = t.description_amharic;

  const { error } = await supabase
    .from('topics')
    .update(updateData)
    .eq('id', t.id);

  if (error) {
    console.error(`❌ Failed to update ${t.id}:`, error.message);
    process.exit(1);
  }
  console.log(`  ✅ ${t.id} → display_order ${t.display_order}`);
}

// Step 2: Add "הכרת הרכב" at display_order 10
console.log('\nשלב 2: מוסיף נושא "הכרת הרכב"...');
const { error: insertError } = await supabase.from('topics').upsert({
  id: 'vehicle_knowledge',
  name_amharic: 'መኪናን ማወቅ',
  name_hebrew: 'הכרת הרכב',
  description_amharic: 'የመኪና ክፍሎች፣ መቆጣጠሪያ ሰሌዳ፣ መስተዋቶች፣ መቀመጫ ቀበቶ፣ መብራቶች፣ የጎማ ግፊት እና የፈሳሽ ምርመራ።',
  icon: '🔧',
  color: '#4527A0',
  sign_count: 0,
  display_order: 10,
}, { onConflict: 'id' });

if (insertError) {
  console.error('❌ Failed to insert vehicle_knowledge:', insertError.message);
  process.exit(1);
}
console.log('  ✅ "הכרת הרכב" נוסף ב-display_order 10');

console.log('\n✅ הכל הושלם בהצלחה!');
