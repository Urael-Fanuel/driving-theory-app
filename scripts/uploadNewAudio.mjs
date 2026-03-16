/**
 * scripts/uploadNewAudio.mjs
 *
 * Uploads the newly generated audio files for numbered signs (104–153)
 * to Supabase Storage and updates the audio URLs in the DB.
 *
 * Background:
 *   Signs 104–153 were added to signs.json after the original uploadContent.ts run.
 *   generateAllAudio.ts just produced 820 new .mp3 files for them.
 *   This script uploads those files and patches the DB.
 *
 * Run:
 *   node --env-file=.env scripts/uploadNewAudio.mjs
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const ROOT       = join(__dirname, '..');
const AUDIO_DIR  = join(ROOT, 'assets', 'audio');
const BUCKET     = 'audio';

// ─── Load env ─────────────────────────────────────────────────────────────────
// (--env-file=.env passed on command line handles this automatically in Node 20+,
//  but we also handle it manually for older Node versions)
if (!process.env.EXPO_PUBLIC_SUPABASE_URL) {
  const envPath = join(ROOT, '.env');
  if (existsSync(envPath)) {
    const lines = readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
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

const SUPABASE_URL  = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌  Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

/** Compute the public Storage URL for an audio filename */
function audioUrl(filename) {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${filename}`;
}

// ─── Load signs.json ──────────────────────────────────────────────────────────
const raw     = readFileSync(join(ROOT, 'content', 'signs.json'), 'utf8');
const stripped = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
const allSigns = JSON.parse(stripped);
const signsArr = Array.isArray(allSigns) ? allSigns : allSigns.signs ?? Object.values(allSigns);

// Filter: numbered signs whose image_filename is "NNN.png" (e.g. "104.png")
// Optional range filter: --from=201 --to=231
const fromArg = process.argv.find(a => a.startsWith('--from='));
const toArg   = process.argv.find(a => a.startsWith('--to='));
const fromNum = fromArg ? parseInt(fromArg.split('=')[1]) : null;
const toNum   = toArg   ? parseInt(toArg.split('=')[1])   : null;

const numberedSigns = signsArr.filter(s => {
  if (!s.image_filename || !/^\d+\.png$/.test(s.image_filename)) return false;
  if (fromNum !== null || toNum !== null) {
    const n = parseInt(s.image_filename);
    if (fromNum !== null && n < fromNum) return false;
    if (toNum   !== null && n > toNum)   return false;
  }
  return true;
});

console.log(`\n🎵  uploadNewAudio.mjs`);
console.log(`${'═'.repeat(55)}`);
console.log(`Numbered signs found in signs.json: ${numberedSigns.length}`);
console.log(`Audio directory: ${AUDIO_DIR}\n`);

// ─── Collect all audio files to upload ───────────────────────────────────────
const toUpload = []; // { filename, signId? } for dedup tracking

for (const sign of numberedSigns) {
  toUpload.push({ filename: sign.audio_name_filename });
  toUpload.push({ filename: sign.audio_explanation_filename });

  for (const q of sign.questions) {
    toUpload.push({ filename: q.question_audio });
    toUpload.push({ filename: q.explanation_correct_audio });
    toUpload.push({ filename: q.explanation_wrong_audio });

    for (const a of q.answers) {
      toUpload.push({ filename: `answer_${q.id}_${a.id}.mp3` });
    }
  }
}

// Deduplicate
const seen = new Set();
const uniqueFiles = toUpload.filter(({ filename }) => {
  if (!filename || seen.has(filename)) return false;
  seen.add(filename);
  return true;
});

console.log(`Total unique audio files to upload: ${uniqueFiles.length}\n`);

// ─── Upload phase ─────────────────────────────────────────────────────────────
let uploaded = 0, skippedMissing = 0, uploadFailed = 0;

console.log('📤  Uploading audio files...');
for (let i = 0; i < uniqueFiles.length; i++) {
  const { filename } = uniqueFiles[i];
  const localPath = join(AUDIO_DIR, filename);

  if (!existsSync(localPath)) {
    console.log(`  ⚠️  Missing locally: ${filename}`);
    skippedMissing++;
    continue;
  }

  const fileData = readFileSync(localPath);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filename, fileData, {
      contentType:  'audio/mpeg',
      cacheControl: '31536000',
      upsert:       true,
    });

  if (error) {
    console.log(`  ❌  Upload failed: ${filename} — ${error.message}`);
    uploadFailed++;
  } else {
    uploaded++;
    if (uploaded % 50 === 0) {
      console.log(`  ... ${uploaded}/${uniqueFiles.length - skippedMissing} uploaded`);
    }
  }
}

console.log(`\n✅  Upload complete: ${uploaded} uploaded, ${skippedMissing} missing locally, ${uploadFailed} failed\n`);

// ─── Upload images to Supabase Storage (images/v4/) ──────────────────────────
console.log('🖼️   Uploading sign images to images/v4/...');
let imagesUploaded = 0, imagesFailed = 0;
const IMAGES_DIR = join(ROOT, 'assets', 'images');

// Search for image in flat dir first, then in named subdirectories
function findImagePath(filename) {
  const candidates = [
    join(IMAGES_DIR, filename),
    join(IMAGES_DIR, 'תמרורי אזהרה', filename),
    join(IMAGES_DIR, 'תמרורי הוריה', filename),
    join(IMAGES_DIR, 'תמרורי זכות קדימה', filename),
  ];
  return candidates.find(p => existsSync(p)) ?? null;
}

for (const sign of numberedSigns) {
  const imgFilename = sign.image_filename; // e.g. "201.png"
  const localImg = findImagePath(imgFilename);
  if (!localImg) {
    console.log(`  ⚠️  Image missing locally: ${imgFilename}`);
    continue;
  }
  const imgData = readFileSync(localImg);  // localImg is the resolved full path
  const { error } = await supabase.storage
    .from('images')
    .upload(`v4/${imgFilename}`, imgData, {
      contentType:  'image/png',
      cacheControl: '31536000',
      upsert:       true,
    });
  if (error) {
    console.log(`  ❌  Image upload failed: ${imgFilename} — ${error.message}`);
    imagesFailed++;
  } else {
    imagesUploaded++;
  }
}
console.log(`  ✅  Images uploaded: ${imagesUploaded}  |  ❌  Failed: ${imagesFailed}\n`);

// ─── DB update: signs table ───────────────────────────────────────────────────
console.log('📝  Updating signs table (audio URLs + Amharic text)...');
let signsOk = 0, signsFailed = 0;

const BATCH = 20;
for (let i = 0; i < numberedSigns.length; i += BATCH) {
  const batch = numberedSigns.slice(i, i + BATCH);
  for (const sign of batch) {
    const signNum = parseInt(sign.image_filename);
    const { error } = await supabase
      .from('signs')
      .upsert({
        id:                    sign.id,
        topic_id:              sign.topic_id,
        name_hebrew:           sign.name_hebrew,
        name_amharic:          sign.name_amharic,
        explanation_amharic:   sign.explanation_amharic,
        audio_name_url:        audioUrl(sign.audio_name_filename),
        audio_explanation_url: audioUrl(sign.audio_explanation_filename),
        image_url:             `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/public/images/v4/${signNum}.png`,
        display_order:         signNum,
      }, { onConflict: 'id' });

    if (error) {
      console.log(`  ❌  signs DB upsert failed for ${sign.id}: ${error.message}`);
      signsFailed++;
    } else {
      signsOk++;
    }
  }
}

console.log(`  ✅  Signs updated (audio + text): ${signsOk}  |  ❌  Failed: ${signsFailed}\n`);

// ─── DB update: questions table ───────────────────────────────────────────────
console.log('📝  Updating questions table (audio URLs + answers JSONB)...');
let questionsOk = 0, questionsFailed = 0;

const allQuestions = numberedSigns.flatMap(sign =>
  sign.questions.map(q => ({
    id:                            q.id,
    sign_id:                       sign.id,
    topic_id:                      sign.topic_id,
    question_amharic:              q.question_amharic,
    question_audio_url:            audioUrl(q.question_audio),
    answers: q.answers.map(a => ({
      id:           a.id,
      text_amharic: a.text_amharic,
      image_url:    null,   // answers for numbered signs have no image
      audio_url:    audioUrl(`answer_${q.id}_${a.id}.mp3`),
      is_correct:   a.is_correct,
    })),
    explanation_correct_amharic:   q.explanation_correct_amharic,
    explanation_wrong_amharic:     q.explanation_wrong_amharic,
    explanation_correct_audio_url: audioUrl(q.explanation_correct_audio),
    explanation_wrong_audio_url:   audioUrl(q.explanation_wrong_audio),
    difficulty:                    1,
  }))
);

for (let i = 0; i < allQuestions.length; i += BATCH) {
  const batch = allQuestions.slice(i, i + BATCH);
  const { error } = await supabase
    .from('questions')
    .upsert(batch, { onConflict: 'id' });

  if (error) {
    console.log(`  ❌  questions upsert batch ${i}–${i + BATCH}: ${error.message}`);
    questionsFailed += batch.length;
  } else {
    questionsOk += batch.length;
  }
}

console.log(`  ✅  Questions updated: ${questionsOk}  |  ❌  Failed: ${questionsFailed}\n`);

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`${'═'.repeat(55)}`);
console.log(`🎉  Done!`);
console.log(`   Audio files uploaded : ${uploaded}`);
console.log(`   Signs DB updated     : ${signsOk}`);
console.log(`   Questions DB updated : ${questionsOk}`);
console.log(`${'═'.repeat(55)}`);
console.log('\nהרץ את האפליקציה ובדוק תמרור 104 — אמור לשמוע אודיו ושאלות.');
