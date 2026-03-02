/**
 * Diagnostic script — checks Supabase Storage buckets and files.
 * Run: npx ts-node scripts/checkStorage.ts
 */

import * as fs   from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

// ─── Load .env ────────────────────────────────────────────────────────────────
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

if (!URL || !KEY) {
  console.error('❌ Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(URL, KEY);

async function main() {
  console.log('\n🔍 Checking Supabase Storage...\n');

  // ── List all buckets ─────────────────────────────────────────────────────────
  const { data: buckets, error: bucketsErr } = await supabase.storage.listBuckets();
  if (bucketsErr) { console.error('❌ Cannot list buckets:', bucketsErr.message); process.exit(1); }

  if (!buckets || buckets.length === 0) {
    console.log('❌ No buckets found! You need to run the upload script first.');
    return;
  }

  console.log('📦 Buckets found:');
  for (const b of buckets) {
    console.log(`   - ${b.name}  (public: ${b.public ? '✅ YES' : '❌ NO'})`);
  }

  // ── Check files in each bucket ───────────────────────────────────────────────
  const BUCKETS_TO_CHECK = ['images', 'audio', 'videos'];

  for (const bucketName of BUCKETS_TO_CHECK) {
    console.log(`\n📂 ${bucketName} bucket:`);
    const bucket = buckets.find(b => b.name === bucketName);
    if (!bucket) {
      console.log(`   ❌ Bucket "${bucketName}" does NOT exist!`);
      continue;
    }

    const { data: files, error: filesErr } = await supabase.storage
      .from(bucketName)
      .list('', { limit: 5 });

    if (filesErr) {
      console.log(`   ❌ Cannot list files: ${filesErr.message}`);
      continue;
    }

    if (!files || files.length === 0) {
      console.log(`   ❌ Bucket is EMPTY — no files uploaded!`);
    } else {
      console.log(`   ✅ Has files. First 5:`);
      for (const f of files) {
        const { data } = supabase.storage.from(bucketName).getPublicUrl(f.name);
        console.log(`      - ${f.name}  → ${data.publicUrl}`);
      }
    }
  }

  console.log('\n✅ Done!\n');
}

main().catch(console.error);
