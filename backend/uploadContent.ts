/**
 * AGENT 2 — uploadContent.ts
 * One-time script to seed the Supabase database and Storage buckets
 * with all content produced by Agent 1.
 *
 * Run this ONCE after setting up your Supabase project:
 *   npx ts-node backend/uploadContent.ts
 *
 * What it does (in order):
 *   1. Creates Storage buckets (images, audio, videos) if they don't exist
 *   2. Uploads all image/audio/video files to Storage
 *   3. Inserts topics into the database
 *   4. Inserts signs into the database
 *   5. Inserts questions into the database
 *
 * Prerequisites:
 *   - EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY set in env
 *   - SUPABASE_SERVICE_ROLE_KEY set (needed for storage admin operations)
 *   - Agent 1 scripts run: assets/images/, assets/audio/, assets/videos/ populated
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ─── Load .env ────────────────────────────────────────────────────────────────
// Inline loader so we don't need the dotenv package
(function loadDotEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  }
})();

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawTopic {
  id: string;
  name_amharic: string;
  name_hebrew: string;
  icon: string;
  color: string;
  description_amharic: string;
  audio_intro: string;
  sign_count: number;
  display_order: number;
}

interface RawAnswer {
  id: string;
  text_amharic: string;
  image: string;
  is_correct: boolean;
}

interface RawQuestion {
  id: string;
  question_amharic: string;
  question_audio: string;
  answers: RawAnswer[];
  explanation_correct_amharic: string;
  explanation_wrong_amharic: string;
  explanation_correct_audio: string;
  explanation_wrong_audio: string;
}

interface RawSign {
  id: string;
  topic_id: string;
  order: number;
  image_filename: string;
  video_filename: string;
  name_hebrew: string;
  name_amharic: string;
  explanation_amharic: string;
  audio_name_filename: string;
  audio_explanation_filename: string;
  questions: RawQuestion[];
}

// ─── Config ───────────────────────────────────────────────────────────────────

const SUPABASE_URL          = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!; // Full admin key

const ASSETS_DIR  = path.join(process.cwd(), 'assets');
const CONTENT_DIR = path.join(process.cwd(), 'content');

const BUCKETS = ['images', 'audio', 'videos'] as const;

// Storage version prefix — bump this whenever images change to bypass CDN cache.
// Old URLs (v2/) are kept in Supabase Storage but no longer referenced in the DB.
const IMG_VERSION = 'v3';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg: string) { console.log(msg); }
function ok(msg: string)  { console.log(`  ✅ ${msg}`); }
function err(msg: string) { console.error(`  ❌ ${msg}`); }
function skip(msg: string){ console.log(`  ⏭  ${msg}`); }

/** Upload a single file to Supabase Storage. Returns public URL. */
async function uploadFile(
  client: SupabaseClient,
  bucket: string,
  localPath: string,
  storagePath: string
): Promise<string | null> {
  if (!fs.existsSync(localPath)) {
    // Skip missing files silently (e.g. videos not yet generated)
    return null;
  }

  const fileBuffer = fs.readFileSync(localPath);
  const contentType = getContentType(localPath);

  const { error } = await client.storage
    .from(bucket)
    .upload(storagePath, fileBuffer, {
      contentType,
      upsert: true, // Overwrite if exists
    });

  if (error) {
    err(`Upload failed: ${storagePath} → ${error.message}`);
    return null;
  }

  const { data } = client.storage.from(bucket).getPublicUrl(storagePath);
  return data.publicUrl;
}

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const types: Record<string, string> = {
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.mp3':  'audio/mpeg',
    '.mp4':  'video/mp4',
    '.json': 'application/json',
  };
  return types[ext] ?? 'application/octet-stream';
}

function mimeType(filename: string): string {
  return getContentType(filename);
}

// ─── Step 1: Create buckets ───────────────────────────────────────────────────

async function createBuckets(client: SupabaseClient): Promise<void> {
  log('\n📦 Step 1: Creating Storage buckets...');

  for (const bucket of BUCKETS) {
    const { data: existing } = await client.storage.getBucket(bucket);
    if (existing) {
      skip(`Bucket already exists: ${bucket}`);
      continue;
    }

    const { error } = await client.storage.createBucket(bucket, {
      public: true,
      allowedMimeTypes: bucket === 'images'
        ? ['image/png', 'image/jpeg']
        : bucket === 'audio'
        ? ['audio/mpeg']
        : ['video/mp4'],
      fileSizeLimit: bucket === 'videos' ? 50 * 1024 * 1024 : 5 * 1024 * 1024, // 50MB for video, 5MB otherwise
    });

    if (error) err(`Create bucket ${bucket}: ${error.message}`);
    else ok(`Created bucket: ${bucket}`);
  }
}

// ─── Step 2: Upload media files ───────────────────────────────────────────────

async function uploadMediaFiles(
  client: SupabaseClient,
  rawSigns: RawSign[]
): Promise<Map<string, string>> {
  log('\n📤 Step 2: Uploading media files...');

  const urlMap = new Map<string, string>(); // localFilename → publicUrl
  let uploadedCount = 0;
  let skippedCount  = 0;

  // Collect all unique files to upload
  const uploads: Array<{ bucket: string; localFile: string; storagePath: string }> = [];

  for (const sign of rawSigns) {
    uploads.push({ bucket: 'images', localFile: sign.image_filename,            storagePath: `${IMG_VERSION}/${sign.image_filename}` });
    uploads.push({ bucket: 'videos', localFile: sign.video_filename,            storagePath: sign.video_filename });
    uploads.push({ bucket: 'audio',  localFile: sign.audio_name_filename,       storagePath: sign.audio_name_filename });
    uploads.push({ bucket: 'audio',  localFile: sign.audio_explanation_filename, storagePath: sign.audio_explanation_filename });

    for (const q of sign.questions) {
      uploads.push({ bucket: 'audio', localFile: q.question_audio, storagePath: q.question_audio });
      uploads.push({ bucket: 'audio', localFile: q.explanation_correct_audio, storagePath: q.explanation_correct_audio });
      uploads.push({ bucket: 'audio', localFile: q.explanation_wrong_audio,   storagePath: q.explanation_wrong_audio });

      for (const a of q.answers) {
        const answerAudio = `answer_${q.id}_${a.id}.mp3`;
        uploads.push({ bucket: 'audio', localFile: answerAudio, storagePath: answerAudio });
      }
    }
  }

  // De-duplicate
  const seen = new Set<string>();
  const uniqueUploads = uploads.filter(u => {
    const key = `${u.bucket}/${u.storagePath}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  log(`  Uploading ${uniqueUploads.length} unique files...`);

  for (const { bucket, localFile, storagePath } of uniqueUploads) {
    const subdir = bucket === 'images' ? 'images' : bucket === 'audio' ? 'audio' : 'videos';
    const localPath = path.join(ASSETS_DIR, subdir, localFile);

    if (!fs.existsSync(localPath)) {
      skip(`Missing (not yet generated): ${localFile}`);
      skippedCount++;
      continue;
    }

    const publicUrl = await uploadFile(client, bucket, localPath, storagePath);
    if (publicUrl) {
      urlMap.set(localFile, publicUrl);
      uploadedCount++;
      if (uploadedCount % 20 === 0) log(`  ... uploaded ${uploadedCount} files`);
    } else {
      skippedCount++;
    }
  }

  ok(`Uploaded ${uploadedCount} files, skipped ${skippedCount}`);
  return urlMap;
}

// ─── Step 3: Seed topics ──────────────────────────────────────────────────────

async function seedTopics(client: SupabaseClient, rawTopics: RawTopic[], urlMap: Map<string, string>): Promise<void> {
  log('\n📝 Step 3: Seeding topics...');

  const rows = rawTopics.map(t => ({
    id:                   t.id,
    name_amharic:         t.name_amharic,
    name_hebrew:          t.name_hebrew,
    icon:                 t.icon,
    color:                t.color,
    description_amharic:  t.description_amharic,
    audio_intro_url:      urlMap.get(t.audio_intro) ?? null,
    sign_count:           t.sign_count,
    display_order:        t.display_order,
  }));

  const { error } = await client
    .from('topics')
    .upsert(rows, { onConflict: 'id' });

  if (error) err(`Seed topics: ${error.message}`);
  else ok(`Seeded ${rows.length} topics`);
}

// ─── Step 4: Seed signs ───────────────────────────────────────────────────────

async function seedSigns(client: SupabaseClient, rawSigns: RawSign[], urlMap: Map<string, string>): Promise<void> {
  log('\n🚦 Step 4: Seeding signs...');

  const rows = rawSigns.map(s => ({
    id:                       s.id,
    topic_id:                 s.topic_id,
    display_order:            s.order,
    name_amharic:             s.name_amharic,
    name_hebrew:              s.name_hebrew,
    explanation_amharic:      s.explanation_amharic,
    image_url:                urlMap.get(s.image_filename)            ?? null,
    video_url:                urlMap.get(s.video_filename)            ?? null,
    audio_name_url:           urlMap.get(s.audio_name_filename)       ?? null,
    audio_explanation_url:    urlMap.get(s.audio_explanation_filename) ?? null,
    difficulty:               1,
  }));

  // Upsert in batches of 20 (Supabase row limit per request)
  const BATCH = 20;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await client.from('signs').upsert(batch, { onConflict: 'id' });
    if (error) err(`Seed signs batch ${i}–${i + BATCH}: ${error.message}`);
    else ok(`Seeded signs ${i + 1}–${Math.min(i + BATCH, rows.length)}`);
  }
}

// ─── Step 5: Seed questions ───────────────────────────────────────────────────

async function seedQuestions(client: SupabaseClient, rawSigns: RawSign[], urlMap: Map<string, string>): Promise<void> {
  log('\n❓ Step 5: Seeding questions...');

  const rows = rawSigns.flatMap(sign =>
    sign.questions.map(q => ({
      id:                             q.id,
      sign_id:                        sign.id,
      topic_id:                       sign.topic_id,
      question_amharic:               q.question_amharic,
      question_audio_url:             urlMap.get(q.question_audio) ?? null,
      answers: q.answers.map(a => ({
        id:             a.id,
        text_amharic:   a.text_amharic,
        image_url:      urlMap.get(a.image) ?? null,
        audio_url:      urlMap.get(`answer_${q.id}_${a.id}.mp3`) ?? null,
        is_correct:     a.is_correct,
      })),
      explanation_correct_amharic:    q.explanation_correct_amharic,
      explanation_wrong_amharic:      q.explanation_wrong_amharic,
      explanation_correct_audio_url:  urlMap.get(q.explanation_correct_audio) ?? null,
      explanation_wrong_audio_url:    urlMap.get(q.explanation_wrong_audio)   ?? null,
      difficulty:                     1,
    }))
  );

  // Upsert in batches
  const BATCH = 20;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await client.from('questions').upsert(batch, { onConflict: 'id' });
    if (error) err(`Seed questions batch ${i}–${i + BATCH}: ${error.message}`);
    else ok(`Seeded questions ${i + 1}–${Math.min(i + BATCH, rows.length)}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log('🚀 Ethiopian Driving Theory App — Content Upload');
  log('='.repeat(60));

  // Validate env
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error(
      '\n❌ Missing environment variables!\n' +
      '   Set EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY\n'
    );
    process.exit(1);
  }

  // Use service role key for admin operations (bypasses RLS)
  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Load Agent 1 content
  // Strip UTF-8 BOM (\uFEFF) if present — some editors add it
  const stripBOM = (s: string) => s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
  const rawTopics: RawTopic[] = JSON.parse(stripBOM(fs.readFileSync(path.join(CONTENT_DIR, 'topics.json'), 'utf-8')));
  const rawSigns:  RawSign[]  = JSON.parse(stripBOM(fs.readFileSync(path.join(CONTENT_DIR, 'signs.json'),  'utf-8')));
  log(`\nLoaded: ${rawTopics.length} topics, ${rawSigns.length} signs`);

  const startTime = Date.now();

  await createBuckets(client);
  const urlMap = await uploadMediaFiles(client, rawSigns);
  await seedTopics(client, rawTopics, urlMap);
  await seedSigns(client, rawSigns, urlMap);
  await seedQuestions(client, rawSigns, urlMap);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  log('\n' + '='.repeat(60));
  log(`🎉 Upload complete in ${elapsed}s`);
  log(`   Topics    : ${rawTopics.length}`);
  log(`   Signs     : ${rawSigns.length}`);
  log(`   Questions : ${rawSigns.reduce((n, s) => n + s.questions.length, 0)}`);
  log(`   Media URLs: ${urlMap.size} files`);
  log('='.repeat(60));
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
