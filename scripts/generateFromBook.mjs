/**
 * generateFromBook.mjs
 *
 * Generates Amharic content for ONE sub-topic using the official
 * Israeli driving theory textbook as the source.
 *
 * Steps:
 *   1. Extract relevant pages from theory_book_text.json
 *   2. Gemini → Amharic explanation + narration + 3 questions
 *   3. Google TTS → MP3
 *   4. Supabase → upload MP3
 *   5. Update vehicle_knowledge_scaffold.json
 *
 * Usage:
 *   node --env-file=.env scripts/generateFromBook.mjs --subtopic vk_l2_s1 --pages 17,132,133
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import { createClient } from '@supabase/supabase-js';

const __dirname     = dirname(fileURLToPath(import.meta.url));
const ROOT          = join(__dirname, '..');
const SCAFFOLD_PATH = join(ROOT, 'content', 'vehicle_knowledge_scaffold.json');
const BOOK_PATH     = join(ROOT, 'content', 'theory_book_text.json');
const TEMP_DIR      = join(ROOT, 'temp_behavioral');

if (!existsSync(TEMP_DIR)) mkdirSync(TEMP_DIR, { recursive: true });

// ─── Args ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const subtopicArg = args.indexOf('--subtopic');
const pagesArg    = args.indexOf('--pages');

if (subtopicArg < 0 || pagesArg < 0) {
  console.error('Usage: node scripts/generateFromBook.mjs --subtopic vk_l2_s1 --pages 17,132,133');
  process.exit(1);
}

const SUBTOPIC_ID = args[subtopicArg + 1];
const PAGE_NUMS   = args[pagesArg + 1].split(',').map(Number);

// ─── Env ───────────────────────────────────────────────────────────────────────
const GEMINI_KEY   = process.env.GEMINI_API_KEY;
const TTS_KEY      = process.env.EXPO_PUBLIC_GOOGLE_TTS_KEY;
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!GEMINI_KEY || !TTS_KEY || !SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Missing env variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── Load data ─────────────────────────────────────────────────────────────────
const scaffold = JSON.parse(readFileSync(SCAFFOLD_PATH, 'utf8'));
const book     = JSON.parse(readFileSync(BOOK_PATH, 'utf8'));

// Find subtopic in scaffold
let foundLevel = null, foundSubtopic = null;
for (const level of scaffold.levels) {
  const sub = level.subtopics.find(s => s.id === SUBTOPIC_ID);
  if (sub) { foundLevel = level; foundSubtopic = sub; break; }
}
if (!foundSubtopic) {
  console.error(`❌ Sub-topic "${SUBTOPIC_ID}" not found in scaffold`);
  process.exit(1);
}

// Extract book pages
const bookText = PAGE_NUMS
  .map(p => {
    const page = book.pages.find(x => x.page === p);
    return page ? `[עמוד ${p}]\n${page.text}` : '';
  })
  .filter(Boolean)
  .join('\n\n');

console.log(`\n📖 נושא: "${foundSubtopic.name_hebrew}" (${SUBTOPIC_ID})`);
console.log(`   עמודים מהספר: ${PAGE_NUMS.join(', ')}`);
console.log(`   אורך טקסט: ${bookText.length} תווים`);

// ─── HTTPS helper ──────────────────────────────────────────────────────────────
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

// ─── Step 1: Gemini → Amharic content ─────────────────────────────────────────
console.log('\n⏳ שלב 1: Gemini מייצר תוכן מהספר הרשמי...');

const prompt = `\
You are creating educational driving content for Ethiopian immigrants learning Israeli driving theory.
The audience is illiterate adults who learn ONLY through audio — no reading.

Here is the official Israeli driving theory textbook content on the topic "${foundSubtopic.name_hebrew}":

--- ספר הלימוד הרשמי ---
${bookText}
--- סוף הספר ---

Based STRICTLY on the textbook content above (do not add information not in the text):

1. Write a simple Amharic explanation (2-3 sentences) — as if speaking to a child
2. Write a 30-45 second Amharic narration script — natural spoken language, no jargon
3. Write 3 exam-style questions in Amharic with 4 answers each

Return this exact JSON (no markdown, no code fences):
{
  "explanation_amharic": "...",
  "narration_script": "...",
  "image_description": "short English description for stock photo search",
  "questions": [
    {
      "question_amharic": "...",
      "answers": [
        { "text_amharic": "...", "is_correct": false },
        { "text_amharic": "...", "is_correct": true },
        { "text_amharic": "...", "is_correct": false },
        { "text_amharic": "...", "is_correct": false }
      ]
    },
    {
      "question_amharic": "...",
      "answers": [
        { "text_amharic": "...", "is_correct": false },
        { "text_amharic": "...", "is_correct": false },
        { "text_amharic": "...", "is_correct": true },
        { "text_amharic": "...", "is_correct": false }
      ]
    },
    {
      "question_amharic": "...",
      "answers": [
        { "text_amharic": "...", "is_correct": false },
        { "text_amharic": "...", "is_correct": false },
        { "text_amharic": "...", "is_correct": false },
        { "text_amharic": "...", "is_correct": true }
      ]
    }
  ]
}`;

let geminiRaw;
for (let attempt = 1; attempt <= 5; attempt++) {
  process.stdout.write(`  ניסיון ${attempt}/5... `);
  geminiRaw = await httpsPost(
    'generativelanguage.googleapis.com',
    `/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
    { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.5, maxOutputTokens: 8192 } }
  );
  const parsed = JSON.parse(geminiRaw.toString('utf-8'));
  if (parsed.error?.message?.includes('high demand') || parsed.error?.message?.includes('overloaded')) {
    console.log(`עומס — ממתין 15 שניות...`);
    await new Promise(r => setTimeout(r, 15000));
    continue;
  }
  console.log('בסדר');
  break;
}

let content;
try {
  const parsed = JSON.parse(geminiRaw.toString('utf-8'));
  if (parsed.error) throw new Error(parsed.error.message);
  const text    = parsed.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const cleaned = text.replace(/^```json\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  content = JSON.parse(cleaned);
} catch(e) {
  console.error('❌ Gemini error:', e.message);
  process.exit(1);
}

console.log('  ✅ תוכן נוצר');
console.log(`  📝 הסבר: ${content.explanation_amharic?.substring(0, 80)}...`);
console.log(`  🎙️  נרטיב: ${content.narration_script?.substring(0, 80)}...`);
console.log(`  ❓ שאלות: ${content.questions?.length}`);

// ─── Step 2: Google TTS → MP3 ─────────────────────────────────────────────────
console.log('\n⏳ שלב 2: Google TTS → MP3...');

const ttsRaw = await httpsPost(
  'texttospeech.googleapis.com',
  `/v1/text:synthesize?key=${TTS_KEY}`,
  {
    input:       { text: content.narration_script },
    voice:       { languageCode: 'am-ET', name: 'am-ET-Standard-A', ssmlGender: 'FEMALE' },
    audioConfig: { audioEncoding: 'MP3', speakingRate: 0.85 },
  }
);

let mp3Buffer;
try {
  const ttsData = JSON.parse(ttsRaw.toString('utf-8'));
  if (ttsData.error) throw new Error(ttsData.error.message);
  mp3Buffer = Buffer.from(ttsData.audioContent, 'base64');
} catch(e) {
  console.error('❌ TTS error:', e.message);
  process.exit(1);
}

const mp3Path = join(TEMP_DIR, `${SUBTOPIC_ID}_narration.mp3`);
writeFileSync(mp3Path, mp3Buffer);
console.log(`  ✅ MP3 נשמר (${(mp3Buffer.byteLength / 1024).toFixed(1)} KB)`);

// ─── Step 3: Upload MP3 to Supabase ───────────────────────────────────────────
console.log('\n⏳ שלב 3: העלאה ל-Supabase...');

const mp3Filename = `behavioral_${SUBTOPIC_ID}_narration.mp3`;
const { error: audioErr } = await supabase.storage
  .from('audio')
  .upload(mp3Filename, mp3Buffer, { contentType: 'audio/mpeg', upsert: true });

if (audioErr) { console.error(`  ⚠️  שגיאה: ${audioErr.message}`); }
else { console.log(`  ✅ MP3 הועלה`); }

const audioUrl = supabase.storage.from('audio').getPublicUrl(mp3Filename).data.publicUrl;

// ─── Step 4: Update scaffold ───────────────────────────────────────────────────
console.log('\n⏳ שלב 4: עדכון scaffold...');

foundSubtopic.explanation_amharic = content.explanation_amharic;
foundSubtopic.narration_script    = content.narration_script;
foundSubtopic.image_description   = content.image_description;
foundSubtopic.narration_audio_url = audioUrl;
foundSubtopic.questions           = content.questions;
foundSubtopic.book_pages          = PAGE_NUMS;

writeFileSync(SCAFFOLD_PATH, JSON.stringify(scaffold, null, 2), 'utf8');
console.log('  ✅ scaffold עודכן');

// ─── Summary ───────────────────────────────────────────────────────────────────
console.log('\n✅ הושלם!');
console.log(`   🎙️  Audio: ${audioUrl}`);
console.log(`   💡 Image: "${content.image_description}"`);
