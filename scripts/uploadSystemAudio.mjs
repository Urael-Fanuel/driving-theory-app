/**
 * scripts/uploadSystemAudio.mjs
 * Uploads named system-audio files from assets/audio/ to Supabase Storage
 * (audio bucket, root level).
 *
 * Generic version of uploadWelcomeAudio.mjs, which has a hardcoded list. Use
 * this whenever a new SYSTEM_AUDIO entry is added in scripts/generateAllAudio.ts
 * and needs to reach the bucket.
 *
 * Deletes before uploading, so the CDN cannot keep serving a stale copy —
 * same reasoning as scripts/uploadNewAudio.mjs.
 *
 * Usage:
 *   node --env-file=.env scripts/uploadSystemAudio.mjs offline_notice.mp3
 *   node --env-file=.env scripts/uploadSystemAudio.mjs a.mp3 b.mp3
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

const FILES = process.argv.slice(2).filter(a => a.endsWith('.mp3'));

if (!FILES.length) {
  console.error('❌  No filenames given.');
  console.error('    Usage: node --env-file=.env scripts/uploadSystemAudio.mjs offline_notice.mp3');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

let ok = 0;
let failed = 0;

for (const filename of FILES) {
  const filePath = join(ROOT, 'assets', 'audio', filename);
  if (!existsSync(filePath)) {
    console.error(`❌  ${filename} not found in assets/audio/ — generate it first`);
    failed++;
    continue;
  }

  const buffer = readFileSync(filePath);

  // Remove first so the CDN cannot serve a cached older version.
  await supabase.storage.from('audio').remove([filename]);

  console.log(`⬆️  Uploading ${filename} (${(buffer.length / 1024).toFixed(1)} KB)...`);
  const { error } = await supabase.storage
    .from('audio')
    .upload(filename, buffer, { contentType: 'audio/mpeg', upsert: true });

  if (error) {
    console.error(`❌  Upload failed for ${filename}:`, error.message);
    failed++;
  } else {
    console.log(`✅  ${filename} uploaded`);
    ok++;
  }
}

console.log('');
console.log(`Done. Uploaded: ${ok}${failed ? `, failed: ${failed}` : ''}`);
