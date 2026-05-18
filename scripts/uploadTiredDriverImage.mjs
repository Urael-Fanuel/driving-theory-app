/**
 * uploadTiredDriverImage.mjs
 * Compresses + uploads "תמונה של נהג עייף.png" → Supabase
 * Updates mind_safety_scaffold.json with new image_url for ms_l1_s1
 */

import { existsSync, readFileSync, writeFileSync, copyFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { createCanvas, loadImage } from 'canvas';

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

const INPUT_HEB = join(ROOT, 'assets', 'images', 'תמונה של נהג עייף.png');
const INPUT_ENG = join(ROOT, 'assets', 'images', 'tired_driver_temp.png');
const OUTPUT    = join(ROOT, 'assets', 'images', 'tired_driver_optimized.jpg');

// ── Step 1: Compress ──────────────────────────────────────────────────────────
console.log('🖼️  דוחס תמונה...');
copyFileSync(INPUT_HEB, INPUT_ENG);

const img   = await loadImage(INPUT_ENG);
const maxW  = 900;
const ratio = maxW / img.width;
const newW  = maxW;
const newH  = Math.round(img.height * ratio);

const cv  = createCanvas(newW, newH);
const ctx = cv.getContext('2d');
ctx.drawImage(img, 0, 0, newW, newH);

const jpegBuffer = cv.toBuffer('image/jpeg', { quality: 0.82 });
writeFileSync(OUTPUT, jpegBuffer);
console.log(`   ${img.width}×${img.height} → ${newW}×${newH} | ${(jpegBuffer.byteLength/1024).toFixed(0)} KB`);

if (existsSync(INPUT_ENG)) unlinkSync(INPUT_ENG);

// ── Step 2: Delete old image ──────────────────────────────────────────────────
const scaffoldPath = join(ROOT, 'content', 'mind_safety_scaffold.json');
const scaffold = JSON.parse(readFileSync(scaffoldPath, 'utf8'));

let foundSub = null;
for (const level of scaffold.levels) {
  const sub = level.subtopics.find(s => s.id === 'ms_l1_s1');
  if (sub) { foundSub = sub; break; }
}

if (foundSub?.image_url) {
  const oldFile = foundSub.image_url.split('/images/').pop()?.split('?')[0];
  if (oldFile) {
    await supabase.storage.from('images').remove([oldFile]);
    console.log(`  🗑️  נמחקה ישנה: ${oldFile}`);
  }
}

// ── Step 3: Upload ────────────────────────────────────────────────────────────
console.log('\n📤 מעלה ל-Supabase...');
const ts = Date.now();
const filename = `behavioral/ms_l1_s1_image_${ts}.jpg`;

const { error } = await supabase.storage
  .from('images')
  .upload(filename, jpegBuffer, { contentType: 'image/jpeg', upsert: false });

if (error) {
  console.error('❌ שגיאת העלאה:', error.message);
  process.exit(1);
}

const imageUrl = supabase.storage.from('images').getPublicUrl(filename).data.publicUrl;
console.log(`  ✅ הועלה: ${imageUrl}`);

// ── Step 4: Update scaffold ───────────────────────────────────────────────────
foundSub.image_url = imageUrl;
writeFileSync(scaffoldPath, JSON.stringify(scaffold, null, 2), 'utf8');
console.log('\n✅ scaffold עודכן!');
console.log(`   🖼️  Image URL: ${imageUrl}`);

if (existsSync(OUTPUT)) unlinkSync(OUTPUT);
