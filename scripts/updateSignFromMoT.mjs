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

// ─── Correct answer prefixes (rotate per sign+question) ───────────────────────
const CORRECT_PREFIXES = [
  'እሰይ የኔ ጎቨዝ።',
  'ትክክል፥ አቬት እውቀት።',
  'ጎሽ።',
  'እንድያ ነው።',
  'አቬት ችሎታ፥ ትክክል።',
  'በጣም አሪፍ።',
  'ትክክል።',
];

// ─── CLI args ─────────────────────────────────────────────────────────────────
const signNumArg = process.argv.find((a, i) => process.argv[i - 1] === '--sign-number');
const motImageArg = process.argv.find((a, i) => process.argv[i - 1] === '--mot-image');
if (!signNumArg) {
  console.error('Usage: node updateSignFromMoT.mjs --sign-number 301 [--mot-image TQ_PIC_3443.jpg]');
  process.exit(1);
}
const SIGN_NUMBER = signNumArg;       // e.g. "301"
// MOT_IMAGE can be comma-separated: "TQ_PIC_3443.jpg,TQ_PIC_3184.jpg"
const MOT_IMAGES = motImageArg ? motImageArg.split(',').map(s => s.trim()) : null;

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

function findMoTQuestionsForSign(motQs, signNumber, motImages) {
  // If explicit MoT image(s) provided, use them directly
  if (motImages && motImages.length > 0) {
    return motQs.filter(q =>
      q.category === 'תמרורים' &&
      q.imageUrl &&
      motImages.some(img => q.imageUrl.includes(img))
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
    // Try .png first, then .jpg (some signs are .jpg)
    const base = sign.image_filename.replace(/\.(png|jpg)$/i, '');
    for (const ext of ['.png', '.jpg', '.jpeg']) {
      const p = join(folder, base + ext);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

// ─── Gemini: generate MoT-style questions + translate (Solution 3) ───────────

async function generateAndTranslateQA(signImagePath, sign) {
  const imageBuffer = readFileSync(signImagePath);
  const base64 = imageBuffer.toString('base64');
  const mimeType = signImagePath.toLowerCase().endsWith('.jpg') || signImagePath.toLowerCase().endsWith('.jpeg')
    ? 'image/jpeg' : 'image/png';

  const prompt = `אתה מומחה למבחני תיאוריה ישראליים ולשפת אמהרית (געז).

מצורפת תמונה של תמרור ישראלי.

━━━ זהות התמרור (מאומת מראש — אל תנחש) ━━━
שם עברי: "${sign.name_hebrew}"
שם באמהרית: "${sign.name_amharic}"
הסבר באמהרית: "${sign.explanation_amharic}"

השתמש במידע הזה כדי להבין בדיוק מה התמרור מצווה ומי חייב לעשות מה.

המשימה: צור 3 שאלות מבחן תיאוריה בסגנון המדויק של משרד התחבורה הישראלי, ותרגם אותן ישירות לאמהרית.

כללי יצירת שאלות בסגנון משרד התחבורה:
- שאלה 1: "מה פירוש התמרור?" או "מה מורה התמרור?"
- שאלה 2: "כיצד תנהג על פי התמרור?" או "מה מחייב התמרור?"
- שאלה 3: שאלה ספציפית על הוראת התמרור או מצב הדרך
- כל שאלה: 4 תשובות (1 נכונה, 3 שגויות ומפתות)
- התשובות השגויות צריכות להיות הגיוניות אך לא נכונות

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
        { inline_data: { mime_type: mimeType, data: base64 } },
        { text: prompt },
      ]}],
      generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
    }),
  });
  const rawText = await res.text();
  let data;
  try { data = JSON.parse(rawText); } catch(e) {
    console.error('API raw response:', rawText.slice(0, 300));
    throw new Error('Failed to parse API response: ' + e.message);
  }
  if (data.error) {
    console.error('Gemini API error:', JSON.stringify(data.error));
    throw new Error('Gemini API error: ' + data.error.message);
  }
  const parts = data.candidates?.[0]?.content?.parts || [];
  const textPart = parts.find(p => p.text) || parts[0];
  const text = textPart?.text?.trim() || '';
  const jsonStr = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error('finishReason:', data.candidates?.[0]?.finishReason);
    console.error('Raw Gemini response (first 500 chars):', text.substring(0, 500));
    throw e;
  }
}

// ─── Gemini translation ───────────────────────────────────────────────────────

async function translateQAToAmharic(motQuestions, signImagePath, sign) {
  const imageBuffer = readFileSync(signImagePath);
  const base64 = imageBuffer.toString('base64');
  const mimeType = signImagePath.toLowerCase().endsWith('.jpg') || signImagePath.toLowerCase().endsWith('.jpeg')
    ? 'image/jpeg' : 'image/png';

  const questionsJson = JSON.stringify(motQuestions.map((q, i) => ({
    index: i + 1,
    question_hebrew: q.questionText,
    answers: q.answers.map(a => ({ text_hebrew: a.text, is_correct: a.isCorrect }))
  })), null, 2);

  const needSupplement = motQuestions.length < 3;
  const supplementNote = needSupplement
    ? `\nיש לך רק ${motQuestions.length} שאלות רשמיות. אתה חייב להוסיף ${3 - motQuestions.length} שאלה/ות נוספת בסגנון זהה לשאלות משרד התחבורה, על בסיס תיאור התמרור. שאלות נוספות לא יחזרו על מה שכבר נשאל.\nהחזר בסך הכל בדיוק 3 שאלות.\n`
    : '';

  const prompt = `אתה מומחה לתמרורי ישראל ולמבחני תיאוריה, ומתרגם לאמהרית (געז).

מצורפת תמונה של תמרור ישראלי.

━━━ זהות התמרור (מאומת מראש — אל תנחש) ━━━
שם עברי: "${sign.name_hebrew}"
שם באמהרית: "${sign.name_amharic}"
הסבר באמהרית: "${sign.explanation_amharic}"

השתמש במידע הזה כדי לדעת בדיוק מה התמרור מצווה ומי חייב לעשות מה — לא לנחש מהתמונה.

━━━ שלב 1: אמת את השאלות ━━━
הנה ${motQuestions.length} שאלות שנשלחו מבנק השאלות של משרד התחבורה:
${questionsJson}
${supplementNote}
עבור כל שאלה ותשובה — בדוק: "האם שאלה זו והתשובה הנכונה שלה מדברות על התמרור שאני רואה בתמונה?"
- אם כן → תרגם אותה לאמהרית
- אם לא (אין קשר לתמרור בתמונה) → החלף אותה בשאלה חדשה שאתה יוצר בסגנון MoT, שאכן עוסקת בתמרור הנכון

━━━ שלב 3: החזר בדיוק 3 שאלות ━━━
כללי חובה לתרגום/יצירה:
- "מה פירוש התמרור?" / "מה מורה התמרור?" → תרגם כ"ምልክቱ ምን ያዝዛል?" (לא "ምን ያሳያል")
- "כיצד תנהג?" → תרגם כשאלת התנהגות, התשובה חייבת לתאר פעולה
- כל שאלה: 4 תשובות (1 נכונה, 3 שגויות ומפתות)
- לכל שאלה: "explanation_correct_amharic" עם פתיחה "ትክክል!" או "አዎ!"
- לכל שאלה: "explanation_wrong_amharic" עם פתיחה "ስህተት! ትክክለኛው መልስ:"
- לפני החזרת JSON: ודא שכל תשובה נכונה עונה ישירות על השאלה שלה

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
        { inline_data: { mime_type: mimeType, data: base64 } },
        { text: prompt },
      ]}],
      generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
    }),
  });
  const data = await res.json();
  // Gemini 2.5 flash may return thinking + output parts; find the text part
  const parts = data.candidates?.[0]?.content?.parts || [];
  const textPart = parts.find(p => p.text) || parts[0];
  const text = textPart?.text?.trim() || '';
  const jsonStr = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error('Raw Gemini response (first 500 chars):', text.substring(0, 500));
    throw e;
  }
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
      explanation_correct_amharic: (() => {
        // Replace Gemini's generic prefix (ትክክል! / አዎ!) with our rotating prefix
        const prefixIdx = (parseInt(signNumber) + qIdx) % CORRECT_PREFIXES.length;
        const prefix = CORRECT_PREFIXES[prefixIdx];
        const stripped = tq.explanation_correct_amharic
          .replace(/^(ትክክል!|አዎ!|እሰይ የኔ ጎቨዝ[።!]?|ትክክል፥ አቬት እውቀት[።!]?|ጎሽ[።!]?|እንድያ ነው[።!]?|አቬት ችሎታ፥ ትክክል[።!]?|በጣም አሪፍ[።!]?|ትክክል[።!]?)\s*/u, '')
          .trim();
        return `${prefix} ${stripped}`;
      })(),
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
  const motQuestions = findMoTQuestionsForSign(motQs, SIGN_NUMBER, MOT_IMAGES);
  console.log(`📋 MoT questions found: ${motQuestions.length}`);
  motQuestions.forEach((q, i) => console.log(`   Q${i+1}: ${q.questionText}`));

  if (motQuestions.length < 3) {
    if (motQuestions.length === 0) {
      console.log(`⚠️  No MoT questions found — using Solution 3 (Gemini generates MoT-style questions)`);
    } else {
      console.warn(`⚠️  Only ${motQuestions.length} MoT questions — Gemini will supplement to reach 3`);
    }
  }

  // 3. Find our sign image
  const imgPath = findOurImagePath(sign);
  if (!imgPath) { console.error('❌ Sign image not found'); process.exit(1); }
  console.log(`🖼️  Image: ${imgPath.split('\\').slice(-2).join('\\')}`);

  // 4. Generate/translate via Gemini
  let translatedQA;
  if (motQuestions.length === 0) {
    console.log('\n🤖 Generating MoT-style questions + translating to Amharic via Gemini...');
    translatedQA = await generateAndTranslateQA(imgPath, sign);
  } else {
    console.log('\n🤖 Translating to Amharic via Gemini...');
    translatedQA = await translateQAToAmharic(motQuestions, imgPath, sign);
  }
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
