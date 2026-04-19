/**
 * generateBehavioralImage.mjs
 *
 * Generates a photorealistic image for ONE behavioral sub-topic using Imagen 4.0:
 *   1. Imagen  → generates image from image_description in scaffold
 *   2. Supabase → uploads JPG to images/behavioral/ bucket
 *   3. JSON    → updates vehicle_knowledge_scaffold.json with image_url
 *
 * Usage:
 *   node --env-file=.env scripts/generateBehavioralImage.mjs --subtopic vk_l2_s5
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import { createClient } from '@supabase/supabase-js';

const __dirname     = dirname(fileURLToPath(import.meta.url));
const ROOT          = join(__dirname, '..');
const SCAFFOLD_PATH = join(ROOT, 'content', 'vehicle_knowledge_scaffold.json');
const TEMP_DIR      = join(ROOT, 'temp_behavioral');

if (!existsSync(TEMP_DIR)) mkdirSync(TEMP_DIR, { recursive: true });

// ─── Args + env ────────────────────────────────────────────────────────────────
const subtopicArg  = process.argv.indexOf('--subtopic');
const SUBTOPIC_ID  = subtopicArg >= 0 ? process.argv[subtopicArg + 1] : null;

// Optional --field flag: which scaffold field to write the URL to (default: image_url)
// Use --field image_url_2 to generate a second image without touching image_url.
const fieldArg    = process.argv.indexOf('--field');
const IMAGE_FIELD = fieldArg >= 0 ? process.argv[fieldArg + 1] : 'image_url';
// The description field to read (image_description_2 when writing to image_url_2)
const DESC_FIELD  = IMAGE_FIELD === 'image_url' ? 'image_description' : `${IMAGE_FIELD.replace('_url', '_description')}`;

if (!SUBTOPIC_ID) {
  console.error('❌ Usage: node generateBehavioralImage.mjs --subtopic <id> [--field image_url_2]');
  process.exit(1);
}

const GEMINI_KEY   = process.env.GEMINI_API_KEY;
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!GEMINI_KEY || !SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Missing env: GEMINI_API_KEY / EXPO_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── Load scaffold ─────────────────────────────────────────────────────────────
const scaffold = JSON.parse(readFileSync(SCAFFOLD_PATH, 'utf8'));

let foundSubtopic = null;
for (const level of scaffold.levels) {
  const sub = level.subtopics.find(s => s.id === SUBTOPIC_ID);
  if (sub) { foundSubtopic = sub; break; }
}

if (!foundSubtopic) {
  console.error(`❌ Sub-topic "${SUBTOPIC_ID}" not found in scaffold.`);
  process.exit(1);
}

const imageDescription = foundSubtopic[DESC_FIELD];
if (!imageDescription) {
  console.error(`❌ Sub-topic "${SUBTOPIC_ID}" has no "${DESC_FIELD}" field.`);
  process.exit(1);
}

console.log(`\n🎯 Sub-topic: "${foundSubtopic.name_hebrew}" (${SUBTOPIC_ID})`);
console.log(`   🖼️  Field: ${IMAGE_FIELD}`);
console.log(`   📝 Image description: ${imageDescription}`);

// ─── Helper: HTTPS POST → Buffer ──────────────────────────────────────────────
function httpsPost(hostname, path, body) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(JSON.stringify(body));
    const req = https.request({
      hostname,
      path,
      method: 'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': buf.byteLength,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

// ─── Step 1: Imagen → Image ───────────────────────────────────────────────────
console.log('\n⏳ שלב 1: Imagen מייצר תמונה...');

// Craft a detailed prompt for a photorealistic, educational, Israeli-context image
const imagenPrompt = `${imageDescription}.
Photorealistic, high quality, well-lit, clear and informative image.
Modern car, daytime.
Safe and educational driving illustration.
No text or watermarks in the image.`;

const imagenBody = {
  instances:  [{ prompt: imagenPrompt }],
  parameters: {
    sampleCount:   1,
    aspectRatio:   '4:3',
    safetyFilterLevel: 'BLOCK_ONLY_HIGH',
  },
};

const raw = await httpsPost(
  'generativelanguage.googleapis.com',
  `/v1beta/models/imagen-4.0-fast-generate-001:predict?key=${GEMINI_KEY}`,
  imagenBody
);

let imageBase64;
try {
  const parsed = JSON.parse(raw.toString('utf-8'));
  if (parsed.error) throw new Error(parsed.error.message);
  imageBase64 = parsed.predictions?.[0]?.bytesBase64Encoded;
  if (!imageBase64) throw new Error('No image data in response');
} catch (e) {
  console.error('❌ Imagen error:', e.message);
  process.exit(1);
}

const imageBuffer = Buffer.from(imageBase64, 'base64');
const imagePath   = join(TEMP_DIR, `${SUBTOPIC_ID}_image.jpg`);
writeFileSync(imagePath, imageBuffer);
console.log(`  ✅ תמונה נשמרה (${(imageBuffer.byteLength / 1024).toFixed(1)} KB)`);

// ─── Step 2: Upload to Supabase ────────────────────────────────────────────────
console.log('\n⏳ שלב 2: העלאה ל-Supabase...');

// Delete old image if exists (only for the field being updated)
if (foundSubtopic[IMAGE_FIELD]) {
  const oldFile = foundSubtopic[IMAGE_FIELD].split('/images/').pop()?.split('?')[0];
  if (oldFile) {
    await supabase.storage.from('images').remove([oldFile]);
    console.log(`  🗑️  נמחק ישן: ${oldFile}`);
  }
}

// Timestamp suffix → bypasses CDN cache
// For image_url_2 add a "2" suffix to make filename distinct from image_url
const ts       = Date.now();
const fieldSuffix = IMAGE_FIELD === 'image_url' ? '' : `_${IMAGE_FIELD.replace('image_url_', '')}`;
const filename = `behavioral/${SUBTOPIC_ID}_image${fieldSuffix}_${ts}.jpg`;
const { error: uploadErr } = await supabase.storage
  .from('images')
  .upload(filename, imageBuffer, { contentType: 'image/jpeg', upsert: false });

if (uploadErr) {
  console.error('❌ Upload error:', uploadErr.message);
  process.exit(1);
}

const imageUrl = supabase.storage.from('images').getPublicUrl(filename).data.publicUrl;
console.log(`  ✅ תמונה הועלתה: ${imageUrl}`);

// ─── Step 3: Update scaffold JSON ─────────────────────────────────────────────
console.log('\n⏳ שלב 3: עדכון scaffold JSON...');

foundSubtopic[IMAGE_FIELD] = imageUrl;
writeFileSync(SCAFFOLD_PATH, JSON.stringify(scaffold, null, 2), 'utf8');
console.log('  ✅ JSON עודכן');

// ─── Done ──────────────────────────────────────────────────────────────────────
console.log('\n✅ הושלם בהצלחה!');
console.log(`   🖼️  Image URL: ${imageUrl}`);
