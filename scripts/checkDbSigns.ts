/**
 * Diagnostic: checks image_url values in the signs table.
 * Run: npx ts-node scripts/checkDbSigns.ts
 */
import * as fs   from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

(function loadDotEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    const val = t.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  }
})();

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  console.log('\n🔍 Checking signs table in DB...\n');

  const { data: signs, error } = await supabase
    .from('signs')
    .select('id, image_url, name_amharic')
    .limit(10);

  if (error) { console.error('❌ DB error:', error.message); return; }
  if (!signs || signs.length === 0) { console.log('❌ No signs in DB!'); return; }

  console.log(`Found ${signs.length} signs (showing first 10):\n`);
  for (const s of signs) {
    const hasImage = s.image_url && s.image_url.startsWith('http');
    console.log(`  ${hasImage ? '✅' : '❌'} ${s.id}`);
    console.log(`     image_url: ${s.image_url ?? '(empty)'}`);
  }
}

main().catch(console.error);
