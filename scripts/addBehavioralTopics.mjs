/**
 * addBehavioralTopics.mjs
 * Inserts the 6 behavioral topic groups into Supabase topics table.
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

const topics = [
  {
    id: 'mind_safety',
    name_amharic: 'አዕምሮ እና ደህንነት',
    name_hebrew: 'מוח ובטיחות',
    description_amharic: 'ትኩረት ማጣት፣ ምላሽ ጊዜ፣ ድካም እና አደጋ ለማወቅ።',
    icon: '🧠',
    color: '#6A1B9A',
    sign_count: 0,
    display_order: 10,
  },
  {
    id: 'society_law',
    name_amharic: 'ማህበረሰብ እና ህግ',
    name_hebrew: 'חברה וחוק',
    description_amharic: 'የሹፌሮች ሃላፊነት፣ ማህበራዊ ግፊት፣ አልኮልና ሹፌርነት።',
    icon: '🤝',
    color: '#1565C0',
    sign_count: 0,
    display_order: 11,
  },
  {
    id: 'the_road',
    name_amharic: 'መንገዱ',
    name_hebrew: 'הדרך',
    description_amharic: 'የመንገድ አካባቢ፣ ከተማ ውስጥ ሹፌርነት፣ መስቀለኛ መንገድ፣ ከባድ ሁኔታዎች።',
    icon: '🛣️',
    color: '#2E7D32',
    sign_count: 0,
    display_order: 12,
  },
  {
    id: 'my_vehicle',
    name_amharic: 'መኪናዬ',
    name_hebrew: 'הרכב שלי',
    description_amharic: 'መኪናን በደህንነት ማስኬድ፣ ቁጥጥር እና ፍጥነት።',
    icon: '🚗',
    color: '#37474F',
    sign_count: 0,
    display_order: 13,
  },
  {
    id: 'two_wheelers',
    name_amharic: 'ሁለት ጎማ ተሽከርካሪዎች',
    name_hebrew: 'דו-גלגלי',
    description_amharic: 'ሞተርሳይክል እና የኤሌክትሪክ ብስክሌቶች።',
    icon: '🛵',
    color: '#E65100',
    sign_count: 0,
    display_order: 14,
  },
  {
    id: 'basics_license',
    name_amharic: 'መሠረቶች እና ፍቃድ',
    name_hebrew: 'יסודות ורישיון',
    description_amharic: 'የሹፌርነት ትምህርት መሠረቶች፣ ደህንነታዊ ሹፌርነት መርሆዎች።',
    icon: '📋',
    color: '#00695C',
    sign_count: 0,
    display_order: 15,
  },
];

console.log('מוסיף 6 נושאי התנהגות לסופאבייס...');

const { error } = await supabase
  .from('topics')
  .upsert(topics, { onConflict: 'id' });

if (error) {
  console.error('❌ Failed:', error.message);
  process.exit(1);
}

console.log('✅ כל 6 הנושאים נוספו בהצלחה!');
