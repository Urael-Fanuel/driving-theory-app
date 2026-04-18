/**
 * compressAndUploadImage.mjs
 * Compresses a heavy image and uploads to Supabase Storage.
 * Uses PowerShell (Windows built-in) for resizing — no extra packages needed.
 *
 * Usage: node --env-file=.env scripts/compressAndUploadImage.mjs
 */

import { existsSync, readFileSync, unlinkSync, writeFileSync, copyFileSync } from 'fs';
import { join, dirname }                    from 'path';
import { fileURLToPath }                    from 'url';
import { createClient }                     from '@supabase/supabase-js';
import { createCanvas, loadImage }          from 'canvas';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const ROOT       = join(__dirname, '..');
const INPUT_HEB  = join(ROOT, 'assets', 'images', 'חגורת בטיחות.png');
const INPUT      = join(ROOT, 'assets', 'images', 'seatbelt_source.png');
const OUTPUT     = join(ROOT, 'assets', 'images', 'seatbelt_optimized.jpg');
const UPLOAD_KEY = 'behavioral/vk_l2_s1_image.jpg';

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Step 1: Compress with canvas ──────────────────────────────────────────────
console.log('🖼️  דוחס תמונה...');
// Copy to English filename first (Hebrew filenames cause issues on Windows)
copyFileSync(INPUT_HEB, INPUT);

const img    = await loadImage(INPUT);
const maxW   = 900;
const ratio  = maxW / img.width;
const newW   = maxW;
const newH   = Math.round(img.height * ratio);

const cv  = createCanvas(newW, newH);
const ctx = cv.getContext('2d');
ctx.drawImage(img, 0, 0, newW, newH);

const jpegBuffer = cv.toBuffer('image/jpeg', { quality: 0.75 });
writeFileSync(OUTPUT, jpegBuffer);

const outKB = (jpegBuffer.byteLength / 1024).toFixed(0);
console.log(`   ${img.width}×${img.height} → ${newW}×${newH} | ${outKB} KB`);
console.log('  ✅ דחיסה הושלמה');

// Clean up temp English copy
if (existsSync(INPUT)) unlinkSync(INPUT);

// ── Step 2: Upload to Supabase ────────────────────────────────────────────────
console.log('\n📤 מעלה ל-Supabase...');
const imageBuffer = readFileSync(OUTPUT);
const { error } = await supabase.storage
  .from('images')
  .upload(UPLOAD_KEY, imageBuffer, { contentType: 'image/jpeg', upsert: true });

if (error) {
  console.error('❌ שגיאת העלאה:', error.message);
  process.exit(1);
}

const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(UPLOAD_KEY);
console.log('  ✅ הועלה');
console.log(`\n🔗 URL: ${publicUrl}`);

// ── Step 3: Update scaffold ───────────────────────────────────────────────────
console.log('\n📝 מעדכן scaffold...');
const scaffoldPath = join(ROOT, 'content', 'vehicle_knowledge_scaffold.json');
const scaffold = JSON.parse(readFileSync(scaffoldPath, 'utf8'));

for (const level of scaffold.levels) {
  const sub = level.subtopics.find(s => s.id === 'vk_l2_s1');
  if (sub) { sub.image_url = publicUrl; break; }
}

writeFileSync(scaffoldPath, JSON.stringify(scaffold, null, 2), 'utf8');
console.log('  ✅ scaffold עודכן');
console.log('\n✅ הכל הושלם!');
