/**
 * scripts/uploadWelcomeAudio.mjs
 * Uploads welcome_select_mode.mp3, explain_mode_a.mp3, explain_mode_b.mp3
 * to Supabase Storage (audio bucket, root level)
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');

// Load .env
if (!process.env.EXPO_PUBLIC_SUPABASE_URL) {
  const envPath = join(ROOT, '.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq < 1) continue;
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim();
      if (k && !(k in process.env)) process.env[k] = v;
    }
  }
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌  Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const FILES = [
  'welcome_select_mode.mp3',
  'explain_mode_a.mp3',
  'explain_mode_b.mp3',
];

for (const filename of FILES) {
  const filePath = join(ROOT, 'assets', 'audio', filename);
  if (!existsSync(filePath)) {
    console.error(`❌  ${filename} not found`);
    continue;
  }
  const buffer = readFileSync(filePath);
  console.log(`⬆️  Uploading ${filename}...`);
  const { error } = await supabase.storage
    .from('audio')
    .upload(filename, buffer, { contentType: 'audio/mpeg', upsert: true });
  if (error) {
    console.error(`❌  Upload failed for ${filename}:`, error.message);
  } else {
    console.log(`✅  ${filename} uploaded successfully`);
  }
}
