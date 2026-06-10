/**
 * uploadPart1.ts
 * Uploads ONLY Part 1 warning sign images (101.png–152.png + sign_road_work.png)
 * then reseeds the signs/topics/questions tables (signs.json changed).
 *
 * Run: npx tsx backend/uploadPart1.ts
 */

import * as fs   from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';

// ── Load .env ─────────────────────────────────────────────────────────────────
(function loadEnv() {
  const p = path.join(process.cwd(), '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (k && !(k in process.env)) process.env[k] = v;
  }
})();

const SUPABASE_URL      = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const IMG_VERSION       = 'v3';

// Build a public audio URL from a filename (files live in the 'audio' bucket root)
const audioUrl = (f: string | null | undefined): string | null =>
  f ? `${SUPABASE_URL}/storage/v1/object/public/audio/${f}` : null;

// Build a public video URL from a filename (files live in the 'videos' bucket root)
const videoUrl = (f: string | null | undefined): string | null =>
  f ? `${SUPABASE_URL}/storage/v1/object/public/videos/${f}` : null;
const ASSETS_IMAGES     = path.join(process.cwd(), 'assets', 'images');
const SIGNS_JSON        = path.join(process.cwd(), 'content', 'signs.json');
const TOPICS_JSON       = path.join(process.cwd(), 'content', 'topics.json');

// Part 1 image files to upload
const PART1_FILES = [
  ...Array.from({ length: 52 }, (_, i) => `${101 + i}.png`),
  'sign_road_work.png',
];

async function uploadImage(client: ReturnType<typeof createClient>, filename: string) {
  const localPath = path.join(ASSETS_IMAGES, filename);
  if (!fs.existsSync(localPath)) {
    console.log(`  ⏭  Missing: ${filename}`);
    return null;
  }
  const data    = fs.readFileSync(localPath);
  const storage = path.posix.join(IMG_VERSION, filename);
  const { error } = await (client.storage as any)
    .from('images')
    .upload(storage, data, { contentType: 'image/png', upsert: true });
  if (error) {
    console.log(`  ❌ ${filename}: ${error.message}`);
    return null;
  }
  const { data: pub } = client.storage.from('images').getPublicUrl(storage);
  console.log(`  ✅ ${filename}`);
  return pub.publicUrl;
}

async function seedAll(client: ReturnType<typeof createClient>, urlMap: Map<string, string>) {
  const rawSigns  = JSON.parse(fs.readFileSync(SIGNS_JSON,  'utf-8'));
  const rawTopics = JSON.parse(fs.readFileSync(TOPICS_JSON, 'utf-8'));

  // ── Topics ────────────────────────────────────────────────────────────────
  console.log('\n📝 Seeding topics...');
  const topicRows = rawTopics.map((t: any) => ({
    id: t.id, name_amharic: t.name_amharic, name_hebrew: t.name_hebrew,
    icon: t.icon, color: t.color, description_amharic: t.description_amharic,
    audio_intro_url: audioUrl(t.audio_intro),
    sign_count: t.sign_count, display_order: t.display_order,
  }));
  const { error: te } = await client.from('topics').upsert(topicRows, { onConflict: 'id' });
  if (te) console.log('  ❌', te.message); else console.log(`  ✅ ${topicRows.length} topics`);

  // ── Signs ─────────────────────────────────────────────────────────────────
  console.log('\n🚦 Seeding signs...');
  const signRows = rawSigns.map((s: any) => ({
    id: s.id, topic_id: s.topic_id, display_order: s.order,
    image_url:             urlMap.get(s.image_filename)   ?? `${SUPABASE_URL}/storage/v1/object/public/images/${IMG_VERSION}/${s.image_filename}`,
    video_url:             videoUrl(s.video_filename),
    audio_name_url:        audioUrl(s.audio_name_filename),
    audio_explanation_url: audioUrl(s.audio_explanation_filename),
    name_hebrew:           s.name_hebrew,
    name_amharic:          s.name_amharic,
    explanation_amharic:   s.explanation_amharic,
  }));

  const CHUNK = 20;
  for (let i = 0; i < signRows.length; i += CHUNK) {
    const chunk = signRows.slice(i, i + CHUNK);
    const { error: se } = await client.from('signs').upsert(chunk, { onConflict: 'id' });
    if (se) console.log(`  ❌ signs ${i+1}-${i+chunk.length}: ${se.message}`);
    else     console.log(`  ✅ signs ${i+1}–${i+chunk.length}`);
  }

  // ── Questions ─────────────────────────────────────────────────────────────
  console.log('\n❓ Seeding questions...');
  const qRows: any[] = [];
  for (const s of rawSigns) {
    for (const q of (s.questions ?? [])) {
      qRows.push({
        id: q.id, sign_id: s.id, topic_id: s.topic_id,
        question_amharic:           q.question_amharic,
        question_audio_url:         audioUrl(q.question_audio),
        answers:                    JSON.stringify(q.answers),
        explanation_correct_amharic: q.explanation_correct_amharic,
        explanation_wrong_amharic:   q.explanation_wrong_amharic,
        explanation_correct_audio_url: audioUrl(q.explanation_correct_audio),
        explanation_wrong_audio_url:   audioUrl(q.explanation_wrong_audio),
      });
    }
  }
  for (let i = 0; i < qRows.length; i += CHUNK) {
    const chunk = qRows.slice(i, i + CHUNK);
    const { error: qe } = await (client as any).from('questions').upsert(chunk, { onConflict: 'id' });
    if (qe) console.log(`  ❌ q${i+1}-${i+chunk.length}: ${qe.message}`);
    else     console.log(`  ✅ questions ${i+1}–${i+chunk.length}`);
  }
}

async function main() {
  const client    = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const urlMap    = new Map<string, string>();
  const seedOnly  = process.argv.includes('--seed-only');

  if (!seedOnly) {
    console.log(`\n📤 Uploading ${PART1_FILES.length} Part 1 images...\n`);
    for (const fname of PART1_FILES) {
      const url = await uploadImage(client as any, fname);
      if (url) urlMap.set(fname, url);
    }
    console.log(`\nUploaded: ${urlMap.size}/${PART1_FILES.length} images`);
  } else {
    // Build urlMap from known public URLs (images already in storage)
    console.log('\n⏩ Skipping image upload (--seed-only)\n');
    for (const fname of PART1_FILES) {
      const storage = path.posix.join(IMG_VERSION, fname);
      const { data: pub } = client.storage.from('images').getPublicUrl(storage);
      urlMap.set(fname, pub.publicUrl);
    }
  }

  await seedAll(client as any, urlMap);
  console.log('\n🎉 Part 1 seed complete');
}

main().catch(console.error);
