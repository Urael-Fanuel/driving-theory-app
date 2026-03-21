/**
 * scripts/forceFixSigns125126.mjs
 *
 * Nuclear fix for signs 125 and 126:
 * 1. DELETE all their audio files from Supabase Storage (not upsert — DELETE)
 * 2. DELETE their questions from DB
 * 3. Re-upload fresh local files
 * 4. Update signs + questions in DB with new cache-bust timestamp
 *
 * Run AFTER deleting local audio and regenerating with generateAllAudio.ts:
 *   node --env-file=.env scripts/forceFixSigns125126.mjs
 */

import { readFileSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');
const AUDIO_DIR = join(ROOT, 'assets', 'audio');
const BUCKET    = 'audio';

// Load env
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

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌  Missing env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// Load signs.json
const raw      = readFileSync(join(ROOT, 'content', 'signs.json'), 'utf8');
const stripped = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
const allSigns = JSON.parse(stripped);
const signsArr = Array.isArray(allSigns) ? allSigns : allSigns.signs ?? Object.values(allSigns);

const sign125 = signsArr.find(s => s.id === 'SIGN_125');
const sign126 = signsArr.find(s => s.id === 'SIGN_126');

if (!sign125 || !sign126) {
  console.error('❌  Could not find SIGN_125 or SIGN_126 in signs.json');
  process.exit(1);
}

const SIGNS = [sign125, sign126];

// Collect all audio filenames for both signs
function getAudioFilenames(sign) {
  const files = [
    sign.audio_name_filename,
    sign.audio_explanation_filename,
  ];
  for (const q of sign.questions) {
    files.push(q.question_audio);
    files.push(q.explanation_correct_audio);
    files.push(q.explanation_wrong_audio);
    for (const a of q.answers) {
      files.push(`answer_${q.id}_${a.id}.mp3`);
    }
  }
  return files.filter(Boolean);
}

const allFiles125 = getAudioFilenames(sign125);
const allFiles126 = getAudioFilenames(sign126);
const allFiles    = [...new Set([...allFiles125, ...allFiles126])];

console.log('\n═══════════════════════════════════════════════════');
console.log('  Force Fix: Signs 125 & 126');
console.log('═══════════════════════════════════════════════════');
console.log(`  Total audio files to process: ${allFiles.length}`);

// ─── STEP 1: Verify local files exist ─────────────────────────────────────────
console.log('\n📋  Step 1: Verifying local files...');
let missingCount = 0;
for (const f of allFiles) {
  const p = join(AUDIO_DIR, f);
  if (!existsSync(p)) {
    console.log(`  ❌  MISSING locally: ${f}`);
    missingCount++;
  } else {
    const size = (statSync(p).size / 1024).toFixed(1);
    if (f.includes('explanation') || f.includes('name')) {
      console.log(`  ✅  ${f.padEnd(40)} ${size}KB`);
    }
  }
}
if (missingCount > 0) {
  console.error(`\n❌  ${missingCount} files missing locally! Run generateAllAudio.ts first.`);
  process.exit(1);
}
console.log('  ✅  All local files present');

// ─── STEP 2: DELETE from Supabase Storage ─────────────────────────────────────
console.log('\n🗑️   Step 2: Deleting from Supabase Storage...');
const { data: removeData, error: removeError } = await supabase.storage
  .from(BUCKET)
  .remove(allFiles);

if (removeError) {
  console.log(`  ⚠️  Storage remove returned error: ${removeError.message}`);
  console.log('  Continuing anyway (files may not have existed)...');
} else {
  console.log(`  ✅  Deleted ${allFiles.length} files from Storage (or they didn't exist)`);
}

// Small delay to let Storage settle
await new Promise(r => setTimeout(r, 2000));

// ─── STEP 3: DELETE questions from DB ─────────────────────────────────────────
console.log('\n🗑️   Step 3: Deleting questions from DB...');
for (const signId of ['SIGN_125', 'SIGN_126']) {
  const { error } = await supabase
    .from('questions')
    .delete()
    .eq('sign_id', signId);
  if (error) {
    console.log(`  ❌  Failed to delete questions for ${signId}: ${error.message}`);
  } else {
    console.log(`  ✅  Questions deleted for ${signId}`);
  }
}

// ─── STEP 4: Upload fresh files ────────────────────────────────────────────────
console.log('\n📤  Step 4: Uploading fresh files to Storage...');
let uploaded = 0, failed = 0;

for (const f of allFiles) {
  const localPath = join(AUDIO_DIR, f);
  const fileData  = readFileSync(localPath);

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(f, fileData, {
      contentType:  'audio/mpeg',
      cacheControl: '31536000',
      upsert:       false, // File was deleted, so no conflict
    });

  if (error) {
    // If "already exists" error, try with upsert
    const { error: upsertErr } = await supabase.storage
      .from(BUCKET)
      .upload(f, fileData, {
        contentType:  'audio/mpeg',
        cacheControl: '31536000',
        upsert:       true,
      });
    if (upsertErr) {
      console.log(`  ❌  Upload failed: ${f} — ${upsertErr.message}`);
      failed++;
    } else {
      uploaded++;
    }
  } else {
    uploaded++;
    if (f.includes('explanation') || f.includes('name')) {
      console.log(`  ✅  Uploaded: ${f}`);
    }
  }
}
console.log(`\n  ✅  Uploaded: ${uploaded}  |  ❌  Failed: ${failed}`);

// ─── STEP 5: Update DB ─────────────────────────────────────────────────────────
const CACHE_BUST = Date.now();
function audioUrl(filename) {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${filename}?v=${CACHE_BUST}`;
}

console.log(`\n📝  Step 5: Updating DB (cache_bust=${CACHE_BUST})...`);

for (const sign of SIGNS) {
  const signNum = parseInt(sign.image_filename);

  // Update signs table
  const { error: signErr } = await supabase
    .from('signs')
    .upsert({
      id:                    sign.id,
      topic_id:              sign.topic_id,
      name_hebrew:           sign.name_hebrew,
      name_amharic:          sign.name_amharic,
      explanation_amharic:   sign.explanation_amharic,
      audio_name_url:        audioUrl(sign.audio_name_filename),
      audio_explanation_url: audioUrl(sign.audio_explanation_filename),
      image_url:             `${SUPABASE_URL}/storage/v1/object/public/images/v4/${signNum}.png`,
      display_order:         signNum,
    }, { onConflict: 'id' });

  if (signErr) {
    console.log(`  ❌  signs table update failed for ${sign.id}: ${signErr.message}`);
  } else {
    console.log(`  ✅  signs table updated: ${sign.id}`);
    console.log(`       audio_name_url:    ${audioUrl(sign.audio_name_filename)}`);
    console.log(`       audio_exp_url:     ${audioUrl(sign.audio_explanation_filename)}`);
  }

  // Insert questions
  const questions = sign.questions.map(q => ({
    id:                            q.id,
    sign_id:                       sign.id,
    topic_id:                      sign.topic_id,
    question_amharic:              q.question_amharic,
    question_audio_url:            audioUrl(q.question_audio),
    answers: q.answers.map(a => ({
      id:           a.id,
      text_amharic: a.text_amharic,
      image_url:    null,
      audio_url:    audioUrl(`answer_${q.id}_${a.id}.mp3`),
      is_correct:   a.is_correct,
    })),
    explanation_correct_amharic:   q.explanation_correct_amharic,
    explanation_wrong_amharic:     q.explanation_wrong_amharic,
    explanation_correct_audio_url: audioUrl(q.explanation_correct_audio),
    explanation_wrong_audio_url:   audioUrl(q.explanation_wrong_audio),
    difficulty:                    1,
  }));

  const { error: qErr } = await supabase
    .from('questions')
    .insert(questions);

  if (qErr) {
    console.log(`  ❌  questions insert failed for ${sign.id}: ${qErr.message}`);
  } else {
    console.log(`  ✅  ${questions.length} questions inserted for ${sign.id}`);
  }
}

// ─── STEP 6: Verify DB ────────────────────────────────────────────────────────
console.log('\n🔍  Step 6: Verifying DB after fix...');
for (const signId of ['SIGN_125', 'SIGN_126']) {
  const { data: qs } = await supabase
    .from('questions')
    .select('id')
    .eq('sign_id', signId);
  const { data: s } = await supabase
    .from('signs')
    .select('audio_explanation_url')
    .eq('id', signId)
    .single();
  console.log(`  ${signId}: ${qs?.length ?? 0} questions | audio_exp_url: ${s?.audio_explanation_url?.slice(-50)}`);
}

console.log('\n═══════════════════════════════════════════════════');
console.log('🎉  Done! Now test the app — signs 125 and 126.');
console.log('═══════════════════════════════════════════════════\n');
