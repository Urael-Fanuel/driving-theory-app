/**
 * addProhibitionsTopic.mjs
 * Inserts the 'prohibitions' topic into Supabase topics table.
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
  id: 'prohibitions',
  name_amharic: 'መከልከልና መገደብ የሚያሳዩ ምልክቶች',
  name_hebrew: 'תמרורי איסורים והגבלות',
  description_amharic: 'እነዚህ ምልክቶች የተወሰኑ ድርጊቶችን ይከለክላሉ ወይም ይገድባሉ። ህጉን ማክበር ግዴታ ነው።',
  icon: '🚫',
  color: '#B71C1C',
  sign_count: 41,
  display_order: 4,
}, { onConflict: 'id' });

if (error) {
  console.error('❌  Failed:', error.message);
  process.exit(1);
}
console.log('✅  Topic "prohibitions" upserted to Supabase.');
