/**
 * uploadProhibitionImages.mjs
 * Uploads sign images for prohibitions (401-441) to Supabase Storage images/v4/
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
let uploaded = 0, failed = 0;

console.log('🖼️   Uploading prohibition sign images (401-441)...');

for (let num = 401; num <= 441; num++) {
  const filename = `${num}.png`;
  const localPath = join(IMAGES_DIR, filename);
  if (!existsSync(localPath)) {
    console.log(`  ⚠️  Missing: ${filename}`);
    continue;
  }
  const data = readFileSync(localPath);
  const { error } = await supabase.storage
    .from('images')
    .upload(`v4/${filename}`, data, { contentType: 'image/png', cacheControl: '31536000', upsert: true });
  if (error) {
    console.log(`  ❌  ${filename}: ${error.message}`);
    failed++;
  } else {
    uploaded++;
  }
}

console.log(`\n✅  Done! Uploaded: ${uploaded}  |  Failed: ${failed}`);
