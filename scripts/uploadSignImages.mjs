/**
 * scripts/uploadSignImages.mjs
 * Uploads new sign images to Supabase Storage and updates the DB image_url.
 *
 * Usage:
 *   node scripts/uploadSignImages.mjs warning 101 102 103 ...
 *   node scripts/uploadSignImages.mjs warning 101-126   (range)
 *
 * What it does:
 *   1. Reads PNG from scripts/downloaded-signs/{category}/{N}.png
 *   2. Uploads to v4/{N}.png in Supabase Storage (images bucket)
 *   3. Deletes old v3/{N}.png from storage (cleanup)
 *   4. Updates image_url in `signs` table (WHERE image_filename = '{N}.png')
 *
 * Using v4/ prefix (instead of v3/) ensures URLs change → React Native
 * fetches fresh images instead of serving stale cache.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const __dirname    = dirname(fileURLToPath(import.meta.url));
const BUCKET       = 'images';
const NEW_PREFIX   = 'v4';
const OLD_PREFIX   = 'v3';

// Build filename → sign_id map from signs.json
const signsJson    = JSON.parse(readFileSync(join(__dirname, '..', 'content', 'signs.json'), 'utf8'));
const signsArr     = Array.isArray(signsJson) ? signsJson : signsJson.signs ?? Object.values(signsJson);
// Map: "101.png" → "SIGN_BUMP"
const filenameToId = Object.fromEntries(
  signsArr
    .filter(s => s.image_filename)
    .map(s => [s.image_filename, s.id])
);

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── Parse arguments ─────────────────────────────────────────────────────────
// node uploadSignImages.mjs warning 101 102 103
// node uploadSignImages.mjs warning 101-126

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node scripts/uploadSignImages.mjs <category> <num> [num...] OR <start-end>');
  console.error('  e.g.: node scripts/uploadSignImages.mjs warning 111 112 113');
  console.error('  e.g.: node scripts/uploadSignImages.mjs warning 111-126');
  process.exit(1);
}

const category = args[0];                // e.g. "warning"

// Map category names to their Hebrew folder names in assets/images/
const HEBREW_FOLDERS = {
  'right_of_way':  'תמרורי זכות קדימה',
  'prohibition':   'תמרורי איסורים והגבלות',
  'public_transport': 'תמרורי תחבורה ציבורית',
  'information_guidance': 'תמרורי מודיעין והדרכה',
};

// Use assets/images/{Hebrew folder} if it exists, otherwise scripts/downloaded-signs/{category}
const hebrewFolder = HEBREW_FOLDERS[category];
const assetsDir = hebrewFolder ? join(__dirname, '..', 'assets', 'images', hebrewFolder) : null;
const SIGNS_DIR = (assetsDir && existsSync(assetsDir))
  ? assetsDir
  : join(__dirname, 'downloaded-signs', category);

let signNumbers = [];
for (const arg of args.slice(1)) {
  if (arg.includes('-')) {
    const [start, end] = arg.split('-').map(Number);
    for (let i = start; i <= end; i++) signNumbers.push(i);
  } else {
    signNumbers.push(Number(arg));
  }
}
signNumbers = signNumbers.filter(n => n > 0);

console.log(`\nUploading ${signNumbers.length} sign(s) [${category}]: ${signNumbers.join(', ')}`);
console.log(`Storage: ${BUCKET}/${NEW_PREFIX}/  |  DB: signs.image_url updated\n`);

// ─── Upload loop ──────────────────────────────────────────────────────────────

let ok = 0, failed = 0;

for (const num of signNumbers) {
  const filename  = `${num}.png`;
  // Support both .png and .jpg source files
  const localPath = existsSync(join(SIGNS_DIR, `${num}.png`))
    ? join(SIGNS_DIR, `${num}.png`)
    : join(SIGNS_DIR, `${num}.jpg`);
  const newPath   = `${NEW_PREFIX}/${filename}`;
  const oldPath   = `${OLD_PREFIX}/${filename}`;

  process.stdout.write(`  [${num}] `);

  if (!existsSync(localPath)) {
    console.log(`⚠️  Local file not found: ${localPath}`);
    failed++;
    continue;
  }

  try {
    // 1. Upload new file to v4/
    const fileData = readFileSync(localPath);
    const { error: upError } = await supabase.storage
      .from(BUCKET)
      .upload(newPath, fileData, {
        contentType:  'image/png',
        cacheControl: '3600',
        upsert:       true,
      });

    if (upError) throw new Error(`Upload failed: ${upError.message}`);

    // 2. Get new public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(newPath);
    const newUrl = urlData.publicUrl;

    // 3. Update image_url in signs table — match by sign id from signs.json
    const signId = filenameToId[filename];
    if (!signId) throw new Error(`No sign_id found for ${filename} in signs.json`);

    const { error: dbError } = await supabase
      .from('signs')
      .update({ image_url: newUrl })
      .eq('id', signId);

    if (dbError) throw new Error(`DB update failed: ${dbError.message}`);

    // 4. Delete old v3/ file (cleanup, ignore errors)
    await supabase.storage.from(BUCKET).remove([oldPath]);

    console.log(`✅  ${newPath}  →  DB updated`);
    ok++;

  } catch (err) {
    console.log(`⚠️  ${err.message}`);
    failed++;
  }
}

console.log(`\n${'═'.repeat(50)}`);
console.log(`✅ Success: ${ok}  |  ⚠️  Failed: ${failed}`);
console.log(`${'═'.repeat(50)}`);
console.log('\nDone. Open the app (no reinstall needed) — images should refresh automatically.');
