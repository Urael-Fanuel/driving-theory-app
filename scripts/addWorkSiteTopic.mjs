/**
 * addWorkSiteTopic.mjs
 * Inserts the 'work_site' topic into Supabase topics table.
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
  id: 'work_site',
  name_amharic: 'የመንገድ ሥራ ቦታ ምልክቶች',
  name_hebrew: 'תמרורים באתר עבודה',
  description_amharic: 'እነዚህ ምልክቶች በመንገድ ሥራ ቦታዎች ላይ ሾፌሮችን ያስጠነቅቃሉ እና ደህንነቱ የተጠበቀ ሁኔታ ያሳያሉ።',
  icon: '🚧',
  color: '#FF6F00',
  sign_count: 35,
  display_order: 9,
}, { onConflict: 'id' });

if (error) {
  console.error('❌  Failed:', error.message);
  process.exit(1);
}
console.log('✅  Topic "work_site" upserted to Supabase.');
