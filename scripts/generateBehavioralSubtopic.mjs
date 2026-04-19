/**
 * generateBehavioralSubtopic.mjs
 *
 * Generates full content for ONE behavioral sub-topic:
 *   1. Gemini  → Amharic explanation + narration script + 3 questions
 *   2. TTS     → narration MP3 (am-ET voice)
 *   3. ffmpeg  → colored background + MP3 → MP4
 *   4. Supabase → upload MP3 + MP4
 *   5. JSON    → update vehicle_knowledge_scaffold.json
 *
 * Usage:
 *   node --env-file=.env scripts/generateBehavioralSubtopic.mjs --subtopic vk_l1_s1
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT          = join(__dirname, '..');
const SCAFFOLD_PATH  = join(ROOT, 'content', 'vehicle_knowledge_scaffold.json');
const BOOK_PATH      = join(ROOT, 'content', 'theory_book_text.json');
const TEMP_DIR       = join(ROOT, 'temp_behavioral');

if (!existsSync(TEMP_DIR)) mkdirSync(TEMP_DIR, { recursive: true });

// ─── Load .env if needed ───────────────────────────────────────────────────────
if (!process.env.EXPO_PUBLIC_SUPABASE_URL) {
  const envPath = join(ROOT, '.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
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

// ─── Args + env ────────────────────────────────────────────────────────────────
const subtopicArg = process.argv.indexOf('--subtopic');
const SUBTOPIC_ID  = subtopicArg >= 0 ? process.argv[subtopicArg + 1] : 'vk_l1_s1';

const GEMINI_KEY  = process.env.GEMINI_API_KEY;
const TTS_KEY     = process.env.EXPO_PUBLIC_GOOGLE_TTS_KEY;
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!GEMINI_KEY || !TTS_KEY || !SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Missing env variables: GEMINI_API_KEY / EXPO_PUBLIC_GOOGLE_TTS_KEY / SUPABASE_URL / SERVICE_KEY');
  process.exit(1);
}

const supabase     = createClient(SUPABASE_URL, SERVICE_KEY);
const GEMINI_MODEL = 'gemini-2.5-flash';

// ─── Load scaffold + book ──────────────────────────────────────────────────────
const scaffold = JSON.parse(readFileSync(SCAFFOLD_PATH, 'utf8'));
const book     = JSON.parse(readFileSync(BOOK_PATH, 'utf8'));

let foundLevel    = null;
let foundSubtopic = null;
for (const level of scaffold.levels) {
  const sub = level.subtopics.find(s => s.id === SUBTOPIC_ID);
  if (sub) { foundLevel = level; foundSubtopic = sub; break; }
}

if (!foundSubtopic) {
  console.error(`❌ Sub-topic "${SUBTOPIC_ID}" not found. Check vehicle_knowledge_scaffold.json`);
  process.exit(1);
}

console.log(`\n🎯 Sub-topic: "${foundSubtopic.name_hebrew}" (${SUBTOPIC_ID})`);
console.log(`   Level ${foundLevel.level}: ${foundLevel.name_hebrew}`);

// ─── Helper: HTTPS POST → Buffer ──────────────────────────────────────────────
function httpsPost(hostname, path, body) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
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

// ─── Step 1: Gemini → content ─────────────────────────────────────────────────
console.log('\n⏳ שלב 1: Gemini מייצר תוכן...');

// Extract relevant book pages if defined on the subtopic
const bookPages     = foundSubtopic.book_pages ?? [];
const bookPageTexts = bookPages
  .map(p => book.pages.find(pg => pg.page === p)?.text ?? '')
  .filter(t => t.length > 0);
const bookSection = bookPageTexts.length > 0
  ? `\n\nTHE FOLLOWING IS THE OFFICIAL BOOK TEXT (pages ${bookPages.join(', ')}) — base ALL content ONLY on this:\n---\n${bookPageTexts.join('\n\n')}\n---`
  : '';

const prompt = `\
You are creating educational driving content for Ethiopian immigrants learning Israeli driving theory.
Topic: "הכרת הרכב" — Getting to know the car (Israeli Ministry of Transport curriculum).
Level ${foundLevel.level}: "${foundLevel.name_hebrew}"
Sub-topic: "${foundSubtopic.name_hebrew}"

IMPORTANT RULES:
- Base ALL content STRICTLY AND ONLY on the official book text provided below. Do NOT add information from outside the book.
- Write only what appears in the official text — do NOT invent or guess.
- Focus on what a driver in Israel must know and is tested on in the Israeli theory exam.
- The audience is illiterate adults who learn only through AUDIO and VISUAL.
- Language must be very simple Amharic — like explaining to a child, no technical jargon.
- CRITICAL: Write ONLY in Amharic. Do NOT use any English words in the Amharic text. If a concept has no Amharic word (e.g. ABS, ESP), use the Amharic transliteration only as last resort.
- Do NOT include production notes or image references like "(Image: ...)" inside the narration_script.
- Do NOT mention "Israel" or any country name. The content applies to ALL countries — treat every rule as a universal driving rule.
- FORMAT: In narration_script, separate logical sections with \\n\\n (double newline). Each section covers one topic (e.g. intro, then each component, then conclusion). This creates readable paragraphs in the app.
- Questions must be based ONLY on the book text provided.${bookSection}

Return this exact JSON (no markdown, no code fences):
{
  "explanation_amharic": "2-3 very simple Amharic sentences explaining this sub-topic based on Israeli driving theory",
  "narration_script": "30-45 second narration in Amharic. Describe what we see and why it matters for safe driving in Israel. Write naturally as if speaking aloud. Keep it simple and factually accurate.",
  "image_description": "Short English description for a stock photo search (e.g. 'front of modern car headlights close up')",
  "questions": [
    {
      "question_amharic": "Question in Amharic about this sub-topic (based on Israeli theory exam style)?",
      "answers": [
        { "text_amharic": "Full sentence answer", "is_correct": false },
        { "text_amharic": "Full sentence answer — this is the correct one", "is_correct": true },
        { "text_amharic": "Full sentence answer", "is_correct": false },
        { "text_amharic": "Full sentence answer", "is_correct": false }
      ]
    },
    {
      "question_amharic": "Second question?",
      "answers": [
        { "text_amharic": "...", "is_correct": false },
        { "text_amharic": "...", "is_correct": false },
        { "text_amharic": "...", "is_correct": true },
        { "text_amharic": "...", "is_correct": false }
      ]
    },
    {
      "question_amharic": "Third question?",
      "answers": [
        { "text_amharic": "...", "is_correct": false },
        { "text_amharic": "...", "is_correct": false },
        { "text_amharic": "...", "is_correct": false },
        { "text_amharic": "...", "is_correct": true }
      ]
    }
  ]
}`;

const geminiBody = {
  contents: [{ parts: [{ text: prompt }] }],
  generationConfig: { temperature: 0.7, maxOutputTokens: 8192, responseMimeType: 'application/json' },
};

const geminiRaw = await httpsPost(
  'generativelanguage.googleapis.com',
  `/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
  geminiBody
);

let content;
try {
  const parsed = JSON.parse(geminiRaw.toString('utf-8'));
  if (parsed.error) throw new Error(parsed.error.message);
  const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  content = JSON.parse(text);
} catch (e) {
  console.error('❌ Gemini parse error:', e.message);
  console.error('Raw:', geminiRaw.toString('utf-8').substring(0, 300));
  process.exit(1);
}

console.log('  ✅ תוכן נוצר');
console.log(`  📝 הסבר: ${content.explanation_amharic?.substring(0, 80)}...`);
console.log(`  🎙️  נרטיב: ${content.narration_script?.substring(0, 80)}...`);
console.log(`  ❓ שאלות: ${content.questions?.length ?? 0}`);

// ─── Step 2: Google TTS → MP3 ─────────────────────────────────────────────────
console.log('\n⏳ שלב 2: Google TTS → MP3...');

const ttsBody = {
  input:       { text: content.narration_script },
  voice:       { languageCode: 'am-ET', name: 'am-ET-Standard-A', ssmlGender: 'FEMALE' },
  audioConfig: { audioEncoding: 'MP3', speakingRate: 0.85, pitch: 0.0,
                 effectsProfileId: ['handset-class-device'] },
};

const ttsRaw = await httpsPost(
  'texttospeech.googleapis.com',
  `/v1/text:synthesize?key=${TTS_KEY}`,
  ttsBody
);

let mp3Buffer;
try {
  const ttsData = JSON.parse(ttsRaw.toString('utf-8'));
  if (ttsData.error) throw new Error(ttsData.error.message);
  mp3Buffer = Buffer.from(ttsData.audioContent, 'base64');
} catch (e) {
  console.error('❌ TTS error:', e.message);
  process.exit(1);
}

const mp3Path = join(TEMP_DIR, `${SUBTOPIC_ID}_narration.mp3`);
writeFileSync(mp3Path, mp3Buffer);
console.log(`  ✅ MP3 נשמר (${(mp3Buffer.byteLength / 1024).toFixed(1)} KB)`);

// ─── Step 3: Upload to Supabase ────────────────────────────────────────────────
console.log('\n⏳ שלב 3: העלאה ל-Supabase...');

// Timestamp suffix → bypasses local audio cache on device
const ts = Date.now();
const mp3Filename = `behavioral_${SUBTOPIC_ID}_narration_${ts}.mp3`;
const { error: audioErr } = await supabase.storage
  .from('audio')
  .upload(mp3Filename, mp3Buffer, { contentType: 'audio/mpeg', upsert: false });
if (audioErr) { console.error(`  ⚠️  שגיאה בהעלאת MP3: ${audioErr.message}`); }
else { console.log(`  ✅ MP3 הועלה: ${mp3Filename}`); }

const audioUrl = supabase.storage.from('audio').getPublicUrl(mp3Filename).data.publicUrl;
const videoUrl = '';

// ─── Step 4: Update scaffold JSON ─────────────────────────────────────────────
console.log('\n⏳ שלב 4: עדכון vehicle_knowledge_scaffold.json...');

// Content parity rule: explanation_amharic (Engine B text) must equal narration_script (Engine A audio)
foundSubtopic.explanation_amharic = content.narration_script;
foundSubtopic.narration_script    = content.narration_script;
foundSubtopic.image_description   = content.image_description;
foundSubtopic.narration_audio_url = audioUrl;
foundSubtopic.video_url           = videoUrl;
foundSubtopic.questions           = content.questions;

writeFileSync(SCAFFOLD_PATH, JSON.stringify(scaffold, null, 2), 'utf8');
console.log('  ✅ JSON עודכן');

// ─── Summary ───────────────────────────────────────────────────────────────────
console.log('\n✅ הושלם בהצלחה!');
console.log(`   🎙️  Audio: ${audioUrl}`);
console.log(`   💡 Image needed: "${content.image_description}"`);
