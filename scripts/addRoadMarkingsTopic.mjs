/**
 * addRoadMarkingsTopic.mjs
 * Inserts the 'road_markings' topic into Supabase topics table.
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

const { error } = await supabase.from('topics').upsert({
  id: 'road_markings',
  name_amharic: 'በመንገድ ላይ የሚሳሉ ምልክቶች',
  name_hebrew: 'תמרורי סימון על פני הדרך',
  description_amharic: 'እነዚህ ምልክቶች በመንገዱ ላይ የሚሳሉ እና ለአሽከርካሪዎች አቅጣጫ የሚሰጡ ናቸው።',
  icon: '🛣️',
  color: '#37474F',
  sign_count: 21,
  display_order: 8,
}, { onConflict: 'id' });

if (error) {
  console.error('❌  Failed:', error.message);
  process.exit(1);
}
console.log('✅  Topic "road_markings" upserted to Supabase.');
