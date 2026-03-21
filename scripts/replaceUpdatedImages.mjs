/**
 * replaceUpdatedImages.mjs
 * Re-uploads 401.png and 414.png to Supabase Storage (replaces old versions).
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

const IMAGES_DIR = join(ROOT, 'assets', 'images', 'תמרורי איסורים והגבלות');
const FILES = ['401.png', '414.png'];

console.log('🖼️   Replacing updated images in Supabase Storage...');

for (const filename of FILES) {
  const localPath = join(IMAGES_DIR, filename);
  if (!existsSync(localPath)) {
    console.log(`  ❌  File not found locally: ${filename}`);
    continue;
  }
  const data = readFileSync(localPath);
  const { error } = await supabase.storage
    .from('images')
    .upload(`v4/${filename}`, data, {
      contentType: 'image/png',
      cacheControl: '31536000',
      upsert: true,
    });
  if (error) {
    console.log(`  ❌  ${filename}: ${error.message}`);
  } else {
    console.log(`  ✅  ${filename} uploaded successfully`);
  }
}

console.log('\n✅  Done!');
