/**
 * updateSignFromMoT.mjs
 * Replaces a sign's Q&A with official MoT questions translated to Amharic.
 *
 * Usage:
 *   node --env-file=.env scripts/updateSignFromMoT.mjs --sign-number 301
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ─── CLI args ─────────────────────────────────────────────────────────────────
const signNumArg = process.argv.find((a, i) => process.argv[i - 1] === '--sign-number');
const motImageArg = process.argv.find((a, i) => process.argv[i - 1] === '--mot-image');
if (!signNumArg) {
  console.error('Usage: node updateSignFromMoT.mjs --sign-number 301 [--mot-image TQ_PIC_3443.jpg]');
  process.exit(1);
}
const SIGN_NUMBER = signNumArg;       // e.g. "301"
const MOT_IMAGE = motImageArg || null; // e.g. "TQ_PIC_3443.jpg" (overrides auto-lookup)

// ─── Clients ──────────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-2.5-flash';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findOurSign(signs, signNumber) {
  return signs.find(s => s.image_filename === `${signNumber}.png`);
}

function findMoTQuestionsForSign(motQs, signNumber, motImage) {
  // If explicit MoT image provided, use it directly
  if (motImage) {
    return motQs.filter(q =>
      q.category === 'תמרורים' &&
      q.imageUrl &&
      q.imageUrl.includes(motImage)
    );
  }
  // Otherwise try auto-lookup: TQ_PIC_3NNN.jpg where NNN = sign number
  const targetUrl = `TQ_PIC_3${signNumber}.jpg`;
  return motQs.filter(q =>
    q.category === 'תמרורים' &&
    q.imageUrl &&
    q.imageUrl.includes(targetUrl)
  );
}

function shuffleAnswers(answers, signIdx, qIdx) {
  // Deterministic shuffle: correct answer position = (signIdx*3 + qIdx) % 4
  const ids = ['A', 'B', 'C', 'D'];
  const targetPos = (signIdx * 3 + qIdx) % 4;
  const correctIdx = answers.findIndex(a => a.is_correct);
  const shuffled = [...answers];
  // Swap correct answer to target position
  [shuffled[targetPos], shuffled[correctIdx]] = [shuffled[correctIdx], shuffled[targetPos]];
  return shuffled.map((a, i) => ({ ...a, id: ids[i] }));
}

function findOurImagePath(sign) {
  const folders = readdirSync(join(ROOT, 'assets', 'images'))
    .map(f => join(ROOT, 'assets', 'images', f));
  for (const folder of folders) {
    const p = join(folder, sign.image_filename);
    if (existsSync(p)) return p;
  }
  return null;
}

// ─── Gemini translation ───────────────────────────────────────────────────────

async function translateQAToAmharic(motQuestions, signImagePath) {
  const imageBuffer = readFileSync(signImagePath);
  const base64 = imageBuffer.toString('base64');

  const questionsJson = JSON.stringify(motQuestions.map((q, i) => ({
    index: i + 1,
    question_hebrew: q.questionText,
    answers: q.answers.map(a => ({ text_hebrew: a.text, is_correct: a.isCorrect }))
  })), null, 2);

  const prompt = `אתה מתרגם שאלות מבחן תיאוריה ישראליות מעברית לשפת אמהרית (געז).

מצורפת תמונה של התמרור הישראלי שעליו עוסקות השאלות.

הנה ${motQuestions.length} שאלות רשמיות של משרד התחבורה הישראלי בעברית:
${questionsJson}

תרגם כל שאלה ואת כל 4 תשובותיה לאמהרית.
כמו כן, לכל שאלה:
- כתוב "explanation_correct_amharic": הסבר קצר (משפט אחד) למה התשובה הנכונה נכונה, עם פתיחה כמו "ትክክል!" או "አዎ!"
- כתוב "explanation_wrong_amharic": הסבר קצר (משפט אחד) למה התשובות השגויות שגויות, עם פתיחה "ስህተት! ትክክለኛው መልስ:"

החזר ONLY JSON בפורמט הבא ללא שום טקסט נוסף:
{
  "questions": [
    {
      "index": 1,
      "question_amharic": "...",
      "explanation_correct_amharic": "ትክክል! ...",
      "explanation_wrong_amharic": "ስህተት! ትክክለኛው መልስ: ...",
      "answers": [
        {"text_amharic": "...", "is_correct": true},
        {"text_amharic": "...", "is_correct": false},
        {"text_amharic": "...", "is_correct": false},
        {"text_amharic": "...", "is_correct": false}
      ]
    }
  ]
}`;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [
        { inline_data: { mime_type: 'image/png', data: base64 } },
        { text: prompt },
      ]}],
      generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
    }),
  });
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  const jsonStr = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  return JSON.parse(jsonStr);
}

// ─── Delete old audio files ───────────────────────────────────────────────────

function deleteOldQuestionAudio(signNumber) {
  const audioDir = join(ROOT, 'assets', 'audio');
  const files = readdirSync(audioDir);
  const toDelete = files.filter(f =>
    f.startsWith(`${signNumber}_q`) ||
    f.startsWith(`answer_${signNumber}_q`)
  );
  toDelete.forEach(f => {
    unlinkSync(join(audioDir, f));
  });
  return toDelete.length;
}

// ─── Build new questions array ────────────────────────────────────────────────

function buildQuestionsArray(signNumber, translatedQA, signIdx) {
  return translatedQA.questions.map((tq, qIdx) => {
    const answers = shuffleAnswers(tq.answers, signIdx, qIdx);
    const qId = `${signNumber}_q${qIdx + 1}`;
    return {
      id: qId,
      question_amharic: tq.question_amharic,
      question_audio: `${qId}_question.mp3`,
      explanation_correct_amharic: tq.explanation_correct_amharic,
      explanation_wrong_amharic: tq.explanation_wrong_amharic,
      explanation_correct_audio: `${qId}_correct.mp3`,
      explanation_wrong_audio: `${qId}_wrong.mp3`,
      answers: answers.map(a => ({
        id: a.id,
        text_amharic: a.text_amharic,
        is_correct: a.is_correct,
        audio_filename: `answer_${qId}_${a.id}.mp3`,
      })),
    };
  });
}

// ─── Supabase: delete old questions ──────────────────────────────────────────

async function deleteOldSupabaseQuestions(signId) {
  const { error } = await supabase
    .from('questions')
    .delete()
    .eq('sign_id', signId);
  if (error) throw new Error('Delete questions failed: ' + error.message);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔄 updateSignFromMoT.mjs — Sign ${SIGN_NUMBER}`);
  console.log('═'.repeat(50));

  // Load data
  const signsPath = join(ROOT, 'content', 'signs.json');
  const signs = JSON.parse(readFileSync(signsPath, 'utf8'));
  const motQs = JSON.parse(readFileSync(join(__dirname, 'output', 'mot_questions.json'), 'utf8'));

  // 1. Find our sign
  const sign = findOurSign(signs, SIGN_NUMBER);
  if (!sign) { console.error(`❌ Sign ${SIGN_NUMBER} not found in signs.json`); process.exit(1); }
  console.log(`✅ Our sign: ${sign.id} (${sign.name_hebrew})`);

  // 2. Find MoT questions for this sign
  const motQuestions = findMoTQuestionsForSign(motQs, SIGN_NUMBER, MOT_IMAGE);
  console.log(`📋 MoT questions found: ${motQuestions.length}`);
  motQuestions.forEach((q, i) => console.log(`   Q${i+1}: ${q.questionText}`));

  if (motQuestions.length === 0) {
    console.error(`❌ No MoT questions found for sign ${SIGN_NUMBER}`);
    process.exit(1);
  }
  if (motQuestions.length < 3) {
    console.warn(`⚠️  Only ${motQuestions.length} MoT questions — need to supplement from past exams`);
  }

  // 3. Find our sign image
  const imgPath = findOurImagePath(sign);
  if (!imgPath) { console.error('❌ Sign image not found'); process.exit(1); }
  console.log(`🖼️  Image: ${imgPath.split('\\').slice(-2).join('\\')}`);

  // 4. Translate via Gemini
  console.log('\n🤖 Translating to Amharic via Gemini...');
  const translatedQA = await translateQAToAmharic(motQuestions, imgPath);
  console.log(`✅ Translated ${translatedQA.questions.length} questions`);
  translatedQA.questions.forEach((q, i) => {
    console.log(`   Q${i+1}: ${q.question_amharic.substring(0, 60)}`);
    q.answers.forEach(a => console.log(`     ${a.is_correct ? '✓' : '✗'} ${a.text_amharic.substring(0, 50)}`));
  });

  // 5. Build new questions array
  const signIdx = signs.indexOf(sign);
  const newQuestions = buildQuestionsArray(SIGN_NUMBER, translatedQA, signIdx);

  // 6. Delete old audio files
  const deletedAudio = deleteOldQuestionAudio(SIGN_NUMBER);
  console.log(`\n🗑️  Deleted ${deletedAudio} old audio files`);

  // 7. Update signs.json
  sign.questions = newQuestions;
  writeFileSync(signsPath, JSON.stringify(signs, null, 2));
  console.log(`✅ signs.json updated for sign ${SIGN_NUMBER}`);

  // 8. Delete old Supabase questions
  console.log(`\n🗑️  Deleting old Supabase questions for ${sign.id}...`);
  await deleteOldSupabaseQuestions(sign.id);
  console.log(`✅ Old questions deleted from Supabase`);

  console.log('\n' + '═'.repeat(50));
  console.log('✅ Done! Next steps:');
  console.log('   1. npx tsx scripts/generateAllAudio.ts');
  console.log(`   2. node --env-file=.env scripts/uploadNewAudio.mjs --from=${SIGN_NUMBER} --to=${SIGN_NUMBER}`);
}

main().catch(e => { console.error('❌ Fatal:', e.message); process.exit(1); });
