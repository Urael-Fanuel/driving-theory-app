/**
 * uploadSignVideo.mjs
 * Uploads a video file to Supabase Storage (videos bucket)
 * and sets the video_url on the specified sign in the DB.
 *
 * Usage:
 *   node --env-file=.env scripts/uploadSignVideo.mjs \
 *     --sign-id RIGHT_OF_WAY_302 \
 *     --file "C:/Users/Yakov/Desktop/סרטון תמרור עצור.mp4" \
 *     --storage-name sign_302_intro.mp4
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import path from 'path';

// ── Args ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const get  = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };

const SIGN_ID      = get('--sign-id');
const FILE_PATH    = get('--file');
const STORAGE_NAME = get('--storage-name');

if (!SIGN_ID || !FILE_PATH || !STORAGE_NAME) {
  console.error('Usage: node uploadSignVideo.mjs --sign-id <id> --file <path> --storage-name <name>');
  process.exit(1);
}

// ── Supabase ──────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BUCKET   = 'videos';
const BASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;

// ── Upload ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n📹 Uploading video for sign: ${SIGN_ID}`);
  console.log(`   File:    ${FILE_PATH}`);
  console.log(`   Storage: ${STORAGE_NAME}\n`);

  // 1. Read file
  const fileBuffer = readFileSync(FILE_PATH);
  const fileExt    = path.extname(FILE_PATH).toLowerCase();
  const mimeType   = fileExt === '.mp4' ? 'video/mp4' : 'video/quicktime';

  // 2. Delete existing file if any
  console.log('🗑️  Removing old file (if exists)...');
  await supabase.storage.from(BUCKET).remove([STORAGE_NAME]);

  // 3. Upload new file
  console.log('⬆️  Uploading...');
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(STORAGE_NAME, fileBuffer, {
      contentType: mimeType,
      upsert: true,
    });

  if (uploadError) {
    console.error('❌ Upload failed:', uploadError.message);
    process.exit(1);
  }

  const video_url = `${BASE_URL}/storage/v1/object/public/${BUCKET}/${STORAGE_NAME}`;
  console.log(`✅ Uploaded! URL: ${video_url}`);

  // 4. Update sign in DB
  console.log('\n📝 Updating sign in DB...');
  const { error: dbError } = await supabase
    .from('signs')
    .update({ video_url })
    .eq('id', SIGN_ID);

  if (dbError) {
    console.error('❌ DB update failed:', dbError.message);
    process.exit(1);
  }

  console.log(`✅ Sign ${SIGN_ID} updated with video_url in DB.`);
  console.log('\n🎉 Done!\n');
}

main().catch(err => { console.error(err); process.exit(1); });
