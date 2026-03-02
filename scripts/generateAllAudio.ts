/**
 * scripts/generateAllAudio.ts
 * Batch generates ALL audio files for the Ethiopian Driving Theory App
 * using Google Cloud Text-to-Speech REST API (Amharic am-ET voice).
 *
 * Usage (from project root):
 *   npx tsx scripts/generateAllAudio.ts
 *
 * Prerequisites:
 *   - EXPO_PUBLIC_GOOGLE_TTS_KEY set in .env (loaded automatically)
 *   - Node.js 18+ (uses built-in fetch) OR any version (uses https module)
 *
 * Output: assets/audio/*.mp3
 * Idempotent: already-generated files are skipped.
 */

import * as fs   from 'fs';
import * as path from 'path';
import * as https from 'https';

// ─── Load .env ────────────────────────────────────────────────────────────────

(function loadDotEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
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

interface Answer  { id: string; text_amharic: string; image: string; is_correct: boolean; }
interface Question {
  id: string;
  question_amharic: string;
  question_audio: string;
  answers: Answer[];
  explanation_correct_amharic: string;
  explanation_wrong_amharic: string;
  explanation_correct_audio: string;
  explanation_wrong_audio: string;
}
interface Sign {
  id: string;
  topic_id: string;
  name_amharic: string;
  explanation_amharic: string;
  audio_name_filename: string;
  audio_explanation_filename: string;
  questions: Question[];
}
interface Topic {
  id: string;
  name_amharic: string;
  description_amharic: string;
  audio_intro: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const OUTPUT_DIR  = path.join(process.cwd(), 'assets', 'audio');
const SIGNS_PATH  = path.join(process.cwd(), 'content', 'signs.json');
const TOPICS_PATH = path.join(process.cwd(), 'content', 'topics.json');

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_TTS_KEY ?? '';
const TTS_HOST = 'texttospeech.googleapis.com';
const TTS_PATH = `/v1/text:synthesize?key=${API_KEY}`;

// System-level audio (Engine A UI navigation)
const SYSTEM_AUDIO: Record<string, string> = {
  'welcome_select_mode.mp3':    'እንኳን ደህና መጡ! እባክዎ የሚፈልጉትን ምርጫ ይምረጡ።',
  'explain_mode_a.mp3':         'ይህ ምርጫ ለምስልና ድምጽ ነው። ቪዲዮ ይሆናልና ድምጽ ይሰማሉ።',
  'explain_mode_b.mp3':         'ይህ ምርጫ ለፅሁፍና ድምጽ ነው። ጽሑፍ ያነቡና ድምጽ ሊሰሙ ይችላሉ።',
  'selected_mode_a.mp3':        'ምስልና ድምጽ ምርጫ ተመርጧል።',
  'selected_mode_b.mp3':        'ፅሁፍ ምርጫ ተመርጧል።',
  'try_again.mp3':              'ዳግም ሞክር። ቁጥሩን ይናገሩ። አንድ፣ ሁለት፣ ወይም ሶስት።',
  'not_heard.mp3':              'ያልተሰማ። ቁጥሩን ይጫኑ።',
  'not_heard_tap_number.mp3':   'አልተሰማም። እባክዎ ቁጥሩን ይጫኑ።',
  'correct_generic.mp3':        'ትክክል ነው!',
  'wrong_generic.mp3':          'ስህተት ነው!',
  'loading.mp3':                'እየጫነ ነው። ይጠብቁ።',
  'network_needed.mp3':         'ኔት ወርክ አስፈልጋል። ኢንተርኔት ያቋቁሙ።',
  'exam_start.mp3':             'ፈተና ጀምሯል። 30 ጥያቄዎች። ይጀምሩ!',
  'exam_pass.mp3':              'እንኳን ደስ አላቸሁ! ፈተናውን አለፉ!',
  'exam_fail.mp3':              'ፈተናው አልተሳካም። ደግሞ ሞክሩ!',
  'go_back.mp3':                'ተመለስ።',
  'start_quiz.mp3':             'ጥያቄ ጀምሩ።',
  'next_question.mp3':          'ቀጣይ ጥያቄ።',
  'watch_video.mp3':            'ቪዲዮ ይመልከቱ።',
  'speak_answer.mp3':           'መልስዎን ይናገሩ። አንድ፣ ሁለት፣ ወይም ሶስት።',
  'home_welcome_a.mp3':         'እንኳን ደህና መጡ! ርዕስ ይምረጡ።',
  'home_welcome_b.mp3':         'እንኳን ደህና መጡ! ርዕስ ይምረጡ።',
};

// ─── Google TTS REST call ─────────────────────────────────────────────────────

/**
 * Calls the Google Cloud TTS REST API and returns MP3 audio as a Buffer.
 * Uses Node.js built-in https module — no extra packages needed.
 */
function callTTS(text: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const bodyObj = {
      input: { text },
      voice: {
        languageCode: 'am-ET',
        name:         'am-ET-Standard-A',
        ssmlGender:   'FEMALE',
      },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate:  0.9,    // Slightly slower for learner clarity
        pitch:         0.0,
        effectsProfileId: ['handset-class-device'],
      },
    };

    const body    = JSON.stringify(bodyObj);
    const options = {
      hostname: TTS_HOST,
      path:     TTS_PATH,
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        try {
          const raw  = Buffer.concat(chunks).toString('utf-8');
          const data = JSON.parse(raw) as { audioContent?: string; error?: { message: string } };
          if (data.error) {
            reject(new Error(`TTS API error: ${data.error.message}`));
          } else if (!data.audioContent) {
            reject(new Error('TTS response has no audioContent'));
          } else {
            resolve(Buffer.from(data.audioContent, 'base64'));
          }
        } catch (parseErr) {
          reject(parseErr);
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Per-file generator (idempotent) ─────────────────────────────────────────

let generatedCount = 0;
let skippedCount   = 0;
let failedCount    = 0;

async function generateAudio(text: string, filename: string): Promise<void> {
  const outputPath = path.join(OUTPUT_DIR, filename);

  if (fs.existsSync(outputPath)) {
    process.stdout.write('⏭ ');
    skippedCount++;
    return;
  }

  try {
    const audioBuffer = await callTTS(text);
    fs.writeFileSync(outputPath, audioBuffer);
    process.stdout.write('✅ ');
    generatedCount++;
  } catch (error) {
    console.error(`\n  ❌ Failed: ${filename} — ${error instanceof Error ? error.message : error}`);
    failedCount++;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function generateAll(): Promise<void> {
  console.log('🎙️  Ethiopian Driving Theory App — Audio Generator');
  console.log('='.repeat(60));

  if (!API_KEY) {
    console.error('\n❌ Missing EXPO_PUBLIC_GOOGLE_TTS_KEY in .env\n');
    process.exit(1);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Strip UTF-8 BOM if present
  const stripBOM = (s: string) => s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s;
  const signs:  Sign[]  = JSON.parse(stripBOM(fs.readFileSync(SIGNS_PATH,  'utf-8')));
  const topics: Topic[] = JSON.parse(stripBOM(fs.readFileSync(TOPICS_PATH, 'utf-8')));

  const startTime = Date.now();

  // ── 1. System / UI audio ─────────────────────────────────────────────────
  console.log(`\n📢 System audio (${Object.keys(SYSTEM_AUDIO).length} files)...`);
  for (const [filename, text] of Object.entries(SYSTEM_AUDIO)) {
    await generateAudio(text, filename);
  }

  // ── 2. Topic intros ───────────────────────────────────────────────────────
  console.log(`\n\n📁 Topic audio (${topics.length * 2} files)...`);
  for (const topic of topics) {
    await generateAudio(topic.name_amharic,        `topic_${topic.id}_name.mp3`);
    await generateAudio(topic.description_amharic,  topic.audio_intro);
  }

  // ── 3. Signs + questions ──────────────────────────────────────────────────
  const totalSignFiles = signs.length * 2;
  const totalQFiles    = signs.reduce((n, s) => n + s.questions.length * (3 + s.questions[0].answers.length), 0);
  console.log(`\n\n🚦 Sign audio (${totalSignFiles} sign files + ~${totalQFiles} question files)...`);

  for (const sign of signs) {
    process.stdout.write(`\n  ${sign.id}: `);

    // Sign name + explanation
    await generateAudio(sign.name_amharic,        sign.audio_name_filename);
    await generateAudio(sign.explanation_amharic,  sign.audio_explanation_filename);

    // Questions
    for (const q of sign.questions) {
      await generateAudio(q.question_amharic,             q.question_audio);
      await generateAudio(q.explanation_correct_amharic,  q.explanation_correct_audio);
      await generateAudio(q.explanation_wrong_amharic,    q.explanation_wrong_audio);
      for (const a of q.answers) {
        await generateAudio(a.text_amharic, `answer_${q.id}_${a.id}.mp3`);
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n\n' + '='.repeat(60));
  console.log('🎉 Audio generation complete!');
  console.log(`   ✅ Generated : ${generatedCount} files`);
  console.log(`   ⏭  Skipped  : ${skippedCount} files (already existed)`);
  console.log(`   ❌ Failed   : ${failedCount} files`);
  console.log(`   ⏱  Duration : ${elapsed}s`);
  console.log(`   📁 Output   : ${OUTPUT_DIR}`);
  console.log('='.repeat(60));

  if (failedCount > 0) {
    console.log('\n⚠️  Some files failed. Common causes:');
    console.log('   - API key not enabled for Text-to-Speech');
    console.log('   - Quota exceeded (free tier: 1M chars/month)');
    console.log('   - Network error — safe to re-run, already-generated files are skipped');
  }
}

generateAll().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
