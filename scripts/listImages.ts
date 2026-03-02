import * as fs from 'fs';
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

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(URL, KEY);

async function main() {
  const { data: files } = await supabase.storage.from('images').list('', { limit: 100 });
  console.log('Total images:', files?.length);
  console.log('Files:', files?.map(f => f.name).join('\n'));
  
  // Check for specific sign files
  const toCheck = ['sign_stop.png', 'sign_give_way.png', 'sign_no_entry.png', 'sign_speed_50.png'];
  for (const f of toCheck) {
    const { data } = await supabase.storage.from('images').list('', { search: f });
    console.log(`${f}: ${data?.length ? '✅ EXISTS' : '❌ NOT FOUND'}`);
  }
}
main().catch(console.error);
