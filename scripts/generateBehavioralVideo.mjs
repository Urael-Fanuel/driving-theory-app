/**
 * generateBehavioralVideo.mjs  (v3 — Pexels Video + Amharic narration)
 *
 * 1. Gemini → decides video type (static/dynamic) + Pexels search query
 * 2. Pexels Videos API → downloads relevant MP4 clip
 * 3. Downloads Amharic narration MP3 from Supabase (if not local)
 * 4. ffmpeg → loops video to match narration length + replaces audio
 * 5. Supabase → uploads final MP4
 * 6. Updates vehicle_knowledge_scaffold.json
 *
 * Usage:
 *   node --env-file=.env scripts/generateBehavioralVideo.mjs --subtopic vk_l1_s1
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import https from 'https';
import http from 'http';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT          = join(__dirname, '..');
const SCAFFOLD_PATH = join(ROOT, 'content', 'vehicle_knowledge_scaffold.json');
const TEMP_DIR      = join(ROOT, 'temp_behavioral');

if (!existsSync(TEMP_DIR)) mkdirSync(TEMP_DIR, { recursive: true });

// ─── Args + env ────────────────────────────────────────────────────────────────
const subtopicArg = process.argv.indexOf('--subtopic');
const SUBTOPIC_ID  = subtopicArg >= 0 ? process.argv[subtopicArg + 1] : 'vk_l1_s1';

const GEMINI_KEY   = process.env.GEMINI_API_KEY;
const PEXELS_KEY   = process.env.PEXELS_API_KEY;
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!GEMINI_KEY || !PEXELS_KEY || !SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Missing env: GEMINI_API_KEY / PEXELS_API_KEY / SUPABASE_URL / SERVICE_KEY');
  process.exit(1);
}

const supabase     = createClient(SUPABASE_URL, SERVICE_KEY);
const GEMINI_MODEL = 'gemini-2.5-flash';

// ─── Load scaffold ─────────────────────────────────────────────────────────────
const scaffold = JSON.parse(readFileSync(SCAFFOLD_PATH, 'utf8'));

let foundLevel    = null;
let foundSubtopic = null;
for (const level of scaffold.levels) {
  const sub = level.subtopics.find(s => s.id === SUBTOPIC_ID);
  if (sub) { foundLevel = level; foundSubtopic = sub; break; }
}

if (!foundSubtopic || !foundSubtopic.narration_script) {
  console.error(`❌ Sub-topic "${SUBTOPIC_ID}" not found or missing narration_script.`);
  console.error('   Run generateBehavioralSubtopic.mjs first.');
  process.exit(1);
}

console.log(`\n🎬 Video v3: "${foundSubtopic.name_hebrew}" (${SUBTOPIC_ID})`);

// ─── Helpers ───────────────────────────────────────────────────────────────────
function httpsPost(hostname, path, body) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(JSON.stringify(body));
    const req = https.request({
      hostname, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': buf.byteLength },
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

function httpsGet(url, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib    = parsed.protocol === 'https:' ? https : http;
    lib.get({
      hostname: parsed.hostname,
      path:     parsed.pathname + parsed.search,
      headers:  { ...extraHeaders },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpsGet(res.headers.location, extraHeaders).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

// ─── Step 1: Gemini → video type + Pexels query ───────────────────────────────
console.log('\n⏳ שלב 1: Gemini מחליט על סוג הסרטון...');

let videoMeta = foundSubtopic.video_search_meta;

if (!videoMeta) {
  const prompt = `\
You are selecting a Pexels stock video clip for an educational driving app.
The video must show a PARKED, STATIONARY car — the camera moves around the car showing specific parts.
No moving cars, no driving, no action scenes.

Sub-topic: "${foundSubtopic.name_hebrew}"
Image description: "${foundSubtopic.image_description ?? ''}"

Write a short English search query (5-8 words) for Pexels Videos.
The query must return a video of a stationary/parked car showing the relevant part.

Return valid JSON only (no markdown):
{
  "pexels_query": "parked sedan car front headlights exterior"
}`;

  const raw = await httpsPost(
    'generativelanguage.googleapis.com',
    `/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
    { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 1024 } }
  );

  try {
    const parsed  = JSON.parse(raw.toString('utf-8'));
    if (parsed.error) throw new Error(parsed.error.message);
    const text  = parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const start = text.indexOf('{');
    const end   = text.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('No JSON object found in response');
    videoMeta = JSON.parse(text.substring(start, end + 1));
    videoMeta.video_type = 'static'; // always static
    console.log(`  ✅ שאילתה: "${videoMeta.pexels_query}"`);

    foundSubtopic.video_search_meta = videoMeta;
    writeFileSync(SCAFFOLD_PATH, JSON.stringify(scaffold, null, 2), 'utf8');
  } catch (e) {
    console.error('  ⚠️  Gemini error:', e.message, '— using fallback');
    videoMeta = { video_type: 'static', pexels_query: 'parked car exterior close up' };
  }
} else {
  console.log(`  ✅ קיים: "${videoMeta.pexels_query}"`);
}

// ─── Step 2: Pexels Videos → download clip ────────────────────────────────────
console.log('\n⏳ שלב 2: Pexels Videos — מוריד קליפ...');

const rawVideoPath = join(TEMP_DIR, `${SUBTOPIC_ID}_clip_raw.mp4`);

if (!existsSync(rawVideoPath)) {
  try {
    const searchUrl = `https://api.pexels.com/videos/search?query=${encodeURIComponent(videoMeta.pexels_query)}&per_page=5&orientation=landscape&size=medium`;
    const searchBuf = await httpsGet(searchUrl, { Authorization: PEXELS_KEY });
    const data      = JSON.parse(searchBuf.toString('utf-8'));

    if (!data.videos || data.videos.length === 0) {
      throw new Error(`No videos found for "${videoMeta.pexels_query}"`);
    }

    // Pick the first video, prefer HD quality (720p or closest)
    const video     = data.videos[0];
    const sortedFiles = (video.video_files || [])
      .filter(f => f.file_type === 'video/mp4')
      .sort((a, b) => {
        // Prefer width closest to 1280
        const da = Math.abs((a.width ?? 0) - 1280);
        const db = Math.abs((b.width ?? 0) - 1280);
        return da - db;
      });

    if (sortedFiles.length === 0) throw new Error('No MP4 files in video result');

    const chosen = sortedFiles[0];
    console.log(`  📹 נמצא: ${video.duration}s, ${chosen.width}×${chosen.height} (${chosen.quality})`);

    const videoBuf = await httpsGet(chosen.link);
    writeFileSync(rawVideoPath, videoBuf);
    console.log(`  ✅ קליפ הורד (${(videoBuf.byteLength / 1024 / 1024).toFixed(1)} MB)`);
  } catch (e) {
    console.error('❌ Pexels Videos error:', e.message);
    process.exit(1);
  }
} else {
  console.log('  ✅ קליפ קיים');
}

// ─── Step 3: Download narration MP3 ───────────────────────────────────────────
console.log('\n⏳ שלב 3: אודיו נרטיב...');

const mp3Path = join(TEMP_DIR, `${SUBTOPIC_ID}_narration.mp3`);

if (!existsSync(mp3Path)) {
  if (!foundSubtopic.narration_audio_url) {
    console.error('❌ narration_audio_url חסר — הרץ generateBehavioralSubtopic.mjs קודם');
    process.exit(1);
  }
  const buf = await httpsGet(foundSubtopic.narration_audio_url);
  writeFileSync(mp3Path, buf);
  console.log(`  ✅ אודיו הורד (${(buf.byteLength / 1024).toFixed(1)} KB)`);
} else {
  console.log('  ✅ אודיו קיים');
}

// Get audio duration
let audioDuration;
try {
  const result = execSync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${mp3Path}"`,
    { encoding: 'utf-8' }
  ).trim();
  audioDuration = parseFloat(result);
  console.log(`  ✅ משך נרטיב: ${audioDuration.toFixed(1)}s`);
} catch (e) {
  console.error('❌ ffprobe נכשל:', e.message);
  process.exit(1);
}

// ─── Step 4: ffmpeg → loop video + swap audio → MP4 ──────────────────────────
console.log('\n⏳ שלב 4: ffmpeg — משלב וידאו + אודיו...');

const mp4Path  = join(TEMP_DIR, `${SUBTOPIC_ID}.mp4`);
const rawEsc   = rawVideoPath.replace(/\\/g, '/');
const mp3Esc   = mp3Path.replace(/\\/g, '/');
const mp4Esc   = mp4Path.replace(/\\/g, '/');

// -stream_loop -1  → loop the video clip indefinitely (stops at audio end via -shortest)
// -c:v libx264     → re-encode so loop works correctly
// -c:a aac         → encode audio
// -map 0:v:0       → take video from first input
// -map 1:a:0       → take audio from second input (our narration)
// -shortest        → stop when shortest stream ends (= when narration ends)
const ffmpegCmd = [
  'ffmpeg -y',
  `-stream_loop -1 -i "${rawEsc}"`,
  `-i "${mp3Esc}"`,
  `-vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,format=yuv420p"`,
  '-map 0:v:0 -map 1:a:0',
  '-c:v libx264 -preset fast -crf 23',
  '-c:a aac -b:a 192k',
  `-t ${audioDuration.toFixed(3)}`,
  `"${mp4Esc}"`,
].join(' ');

try {
  execSync(ffmpegCmd, { stdio: 'pipe' });
  const mp4Size = readFileSync(mp4Path).byteLength;
  console.log(`  ✅ MP4 נוצר: ${(mp4Size / 1024 / 1024).toFixed(1)} MB, ${audioDuration.toFixed(1)}s`);
} catch (e) {
  const errMsg = e.stderr?.toString() ?? e.message;
  console.error('❌ ffmpeg נכשל:');
  console.error(errMsg.substring(0, 800));
  process.exit(1);
}

// ─── Step 5: Upload to Supabase ────────────────────────────────────────────────
console.log('\n⏳ שלב 5: Supabase...');

const mp4Buffer   = readFileSync(mp4Path);
const mp4Filename = `behavioral_${SUBTOPIC_ID}.mp4`;

const { error: videoErr } = await supabase.storage
  .from('videos')
  .upload(mp4Filename, mp4Buffer, { contentType: 'video/mp4', upsert: true });

if (videoErr) {
  console.error(`  ❌ שגיאת העלאה: ${videoErr.message}`);
  process.exit(1);
}

const videoUrl = supabase.storage.from('videos').getPublicUrl(mp4Filename).data.publicUrl;
console.log(`  ✅ הועלה: ${videoUrl}`);

// ─── Step 6: Update scaffold ───────────────────────────────────────────────────
foundSubtopic.video_url = videoUrl;
writeFileSync(SCAFFOLD_PATH, JSON.stringify(scaffold, null, 2), 'utf8');

console.log('\n✅ הושלם!');
console.log(`   🎬 סוג: ${videoMeta.video_type}`);
console.log(`   🔍 שאילתה: "${videoMeta.pexels_query}"`);
console.log(`   📺 URL: ${videoUrl}`);
