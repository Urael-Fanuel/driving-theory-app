/**
 * deleteOldTopics.mjs
 * Deletes information, road_markings, safety topics + their signs/questions from Supabase DB.
 * Run ONCE before rebuilding content.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Load .env manually if needed
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

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌  Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const TOPICS_TO_DELETE = ['information', 'road_markings', 'safety'];

console.log('\n🗑️   deleteOldTopics.mjs');
console.log('═'.repeat(50));
console.log(`Topics to delete: ${TOPICS_TO_DELETE.join(', ')}\n`);

// 1. Delete questions
console.log('1️⃣   Deleting questions...');
const { error: qErr, count: qCount } = await supabase
  .from('questions')
  .delete({ count: 'exact' })
  .in('topic_id', TOPICS_TO_DELETE);

if (qErr) {
  console.error('❌  questions delete failed:', qErr.message);
  process.exit(1);
}
console.log(`   ✅  Deleted questions (count: ${qCount ?? 'unknown'})`);

// 2. Delete signs
console.log('2️⃣   Deleting signs...');
const { error: sErr, count: sCount } = await supabase
  .from('signs')
  .delete({ count: 'exact' })
  .in('topic_id', TOPICS_TO_DELETE);

if (sErr) {
  console.error('❌  signs delete failed:', sErr.message);
  process.exit(1);
}
console.log(`   ✅  Deleted signs (count: ${sCount ?? 'unknown'})`);

// 3. Delete topics
console.log('3️⃣   Deleting topics...');
const { error: tErr, count: tCount } = await supabase
  .from('topics')
  .delete({ count: 'exact' })
  .in('id', TOPICS_TO_DELETE);

if (tErr) {
  console.error('❌  topics delete failed:', tErr.message);
  process.exit(1);
}
console.log(`   ✅  Deleted topics (count: ${tCount ?? 'unknown'})`);

console.log('\n' + '═'.repeat(50));
console.log('🎉  Done! DB cleaned.');
console.log('   information, road_markings, safety — removed from DB.');
