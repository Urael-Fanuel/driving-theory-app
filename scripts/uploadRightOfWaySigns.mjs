/**
 * scripts/uploadRightOfWaySigns.mjs
 * Uploads תמרורי זכות קדימה (301-310) from local folder to Supabase Storage
 * and updates image_url in the signs DB table.
 *
 * Usage:
 *   node scripts/uploadRightOfWaySigns.mjs
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUCKET     = 'images';
const NEW_PREFIX = 'v4';
const OLD_PREFIX = 'v3';

// Local folder where images are saved (by official number)
const SIGNS_DIR = join(__dirname, '..', 'assets', 'images', 'תמרורי זכות קדימה');

// Mapping: official number → sign ID in DB
const MAPPING = {
  301: 'ROW_FOUR_WAY_STOP',
  302: 'ROW_JUNCTION_YIELD',
  303: 'ROW_MAIN_ROAD',
  305: 'ROW_PRIORITY_ROAD',
  306: 'ROW_END_PRIORITY',
  307: 'ROW_MERGE',
  308: 'ROW_YIELD_ONCOMING',
  310: 'ROW_ROUNDABOUT',
};

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

console.log('\nUploading תמרורי זכות קדימה to Supabase Storage...\n');

let ok = 0, failed = 0;

for (const [numStr, signId] of Object.entries(MAPPING)) {
  const num      = Number(numStr);
  // Support both .png and .jpg
  let localPath = join(SIGNS_DIR, `${num}.png`);
  if (!existsSync(localPath)) localPath = join(SIGNS_DIR, `${num}.jpg`);

  const storageName = `${num}.png`;
  const newPath     = `${NEW_PREFIX}/${storageName}`;
  const oldPath     = `${OLD_PREFIX}/${storageName}`;

  process.stdout.write(`  [${num}] ${signId} — `);

  if (!existsSync(localPath)) {
    console.log(`⚠️  קובץ לא נמצא: ${localPath}`);
    failed++;
    continue;
  }

  try {
    const fileData = readFileSync(localPath);

    // 1. Upload to Supabase Storage
    const { error: upError } = await supabase.storage
      .from(BUCKET)
      .upload(newPath, fileData, {
        contentType:  'image/png',
        cacheControl: '3600',
        upsert:       true,
      });
    if (upError) throw new Error(`Upload failed: ${upError.message}`);

    // 2. Get public URL
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(newPath);
    const newUrl = urlData.publicUrl;

    // 3. Update image_url in DB
    const { error: dbError } = await supabase
      .from('signs')
      .update({ image_url: newUrl })
      .eq('id', signId);
    if (dbError) throw new Error(`DB update failed: ${dbError.message}`);

    // 4. Clean up old version
    await supabase.storage.from(BUCKET).remove([oldPath]);

    console.log(`✅  ${newPath}`);
    ok++;

  } catch (err) {
    console.log(`❌  ${err.message}`);
    failed++;
  }
}

console.log(`\n${'═'.repeat(50)}`);
console.log(`✅ הצליחו: ${ok}  |  ❌ נכשלו: ${failed}`);
console.log(`${'═'.repeat(50)}`);
console.log('\nסיום. פתח את האפליקציה — התמונות יתרעננו אוטומטית.');
