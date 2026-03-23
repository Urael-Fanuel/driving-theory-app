/**
 * _fixPublicTransport.mjs
 * Fixes a public_transport sign: Gemini identifies the sign from image,
 * generates correct name_amharic + explanation_amharic + 3 MoT-style Q&A.
 *
 * Usage:
 *   node --env-file=.env scripts/_fixPublicTransport.mjs --sign-number 506
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SIGNS_PATH = join(ROOT, 'content', 'signs.json');
const AUDIO_DIR = join(ROOT, 'assets', 'audio');

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-2.5-flash';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

const CORRECT_PREFIXES = [
  'እሰይ የኔ ጎቨዝ።',
  'ትክክል፥ አቬት እውቀት።',
  'ጎሽ።',
  'እንድያ ነው።',
  'አቬት ችሎታ፥ ትክክል።',
  'በጣም አሪፍ።',
  'ትክክል።',
];

const signNumArg = process.argv.find((a, i) => process.argv[i - 1] === '--sign-number');
if (!signNumArg) {
  console.error('Usage: node _fixPublicTransport.mjs --sign-number 506');
  process.exit(1);
}
const SIGN_NUMBER = signNumArg;

function shuffleAnswers(answers, signIdx, qIdx) {
  const ids = ['A', 'B', 'C', 'D'];
  const targetPos = (signIdx * 3 + qIdx) % 4;
  const correctIdx = answers.findIndex(a => a.is_correct);
  const shuffled = [...answers];
  [shuffled[targetPos], shuffled[correctIdx]] = [shuffled[correctIdx], shuffled[targetPos]];
  return shuffled.map((a, i) => ({ ...a, id: ids[i] }));
}

function deleteOldAudio(signNumber) {
  const files = readdirSync(AUDIO_DIR).filter(f =>
    f.startsWith(`${signNumber}_`) || f.startsWith(`answer_${signNumber}_`)
  );
  files.forEach(f => { try { unlinkSync(join(AUDIO_DIR, f)); } catch {} });
  if (files.length > 0) console.log(`🗑  Deleted ${files.length} old audio files for sign ${signNumber}`);
}

async function callGemini(imagePath, prompt) {
  const imageBuffer = readFileSync(imagePath);
  const base64 = imageBuffer.toString('base64');
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [
        { inline_data: { mime_type: 'image/png', data: base64 } },
        { text: prompt },
      ]}],
      generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
    }),
  });
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const textPart = parts.find(p => p.text) || parts[0];
  return textPart?.text?.trim() || '';
}

async function main() {
  const signs = JSON.parse(readFileSync(SIGNS_PATH, 'utf8'));
  const signIdx = signs.findIndex(s => s.image_filename === `${SIGN_NUMBER}.png`);
  if (signIdx === -1) { console.error(`Sign ${SIGN_NUMBER} not found`); process.exit(1); }

  const sign = signs[signIdx];
  const imagePath = join(ROOT, 'assets', 'images', 'תמרורי תחבורה ציבורית', `${SIGN_NUMBER}.png`);
  if (!existsSync(imagePath)) { console.error('Image not found:', imagePath); process.exit(1); }

  console.log(`\n🔧 Fixing sign ${SIGN_NUMBER} (public transport)...`);

  // Step 1: Gemini identifies sign and generates name + explanation
  const identifyPrompt = `אתה מומחה לתמרורי ישראל ולחוקי התנועה הישראליים, ומתרגם לאמהרית (געז).

מצורפת תמונה של תמרור ישראלי מקטגוריית "תמרורי תחבורה ציבורית" (מספר ${SIGN_NUMBER}).

שלב 1: זהה את התמרור בדיוק — מה הוא מורה? מה אסור? מה מותר? לאיזה סוג רכב?
שלב 2: תרגם לאמהרית (שם קצר עד 10 מילים + הסבר של 2-3 משפטים).

החזר JSON בלבד:
{"name_amharic": "...", "explanation_amharic": "..."}`;

  const nameRaw = await callGemini(imagePath, identifyPrompt);
  const nameJson = nameRaw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  const { name_amharic, explanation_amharic } = JSON.parse(nameJson);
  console.log('✅ name_amharic:', name_amharic);
  console.log('✅ explanation_amharic:', explanation_amharic.slice(0, 100));

  // Step 2: Generate MoT-style Q&A
  const qaPrompt = `אתה מומחה למבחני תיאוריה ישראליים ולשפת אמהרית (געז).

מצורפת תמונה של תמרור ישראלי מספר ${SIGN_NUMBER} מקטגוריית תחבורה ציבורית.

━━━ זהות התמרור ━━━
שם באמהרית: "${name_amharic}"
הסבר באמהרית: "${explanation_amharic}"

השתמש במידע הזה כדי להבין בדיוק מה התמרור מצווה.

צור 3 שאלות מבחן תיאוריה בסגנון משרד התחבורה, מתורגמות לאמהרית:
- שאלה 1: "מה פירוש תמרור זה?" / "מה מורה תמרור זה?"
- שאלה 2: שאלה על מה מותר/אסור לפי התמרור
- שאלה 3: שאלה ספציפית על יישום הוראת התמרור

כל שאלה: 4 תשובות (1 נכונה, 3 שגויות אך הגיוניות).

החזר JSON בלבד:
{
  "questions": [
    {
      "index": 1,
      "question_amharic": "...",
      "explanation_correct_amharic": "ትክክл! ...",
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

  const qaRaw = await callGemini(imagePath, qaPrompt);
  const qaJson = qaRaw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  const { questions } = JSON.parse(qaJson);
  console.log('✅ Generated', questions.length, 'questions');

  // Step 3: Build questions with correct structure
  const prefixBase = signIdx;

  const newQuestions = questions.map((q, qi) => {
    const prefixIdx = (prefixBase * 3 + qi) % CORRECT_PREFIXES.length;
    const prefix = CORRECT_PREFIXES[prefixIdx];

    const cleanCorrect = q.explanation_correct_amharic
      .replace(/^(ትክክл!|አዎ!|እሰይ የኔ ጎቨዝ[።!]?|ትክክл፥ አቬት እውቀት[።!]?|ጎሽ[።!]?|እንድያ ነው[።!]?|አቬት ችሎታ፥ ትክክл[።!]?|በጣም አሪፍ[።!]?|ትክክл[።!]?)\s*/u, '');

    const answers = shuffleAnswers(
      q.answers.map((a, ai) => ({
        id: ['A','B','C','D'][ai],
        text_amharic: a.text_amharic,
        is_correct: a.is_correct,
        audio_filename: `answer_${SIGN_NUMBER}_q${qi+1}_${'ABCD'[ai]}.mp3`,
      })),
      prefixBase,
      qi
    ).map((a, ai) => ({
      ...a,
      id: ['A','B','C','D'][ai],
      audio_filename: `answer_${SIGN_NUMBER}_q${qi+1}_${'ABCD'[ai]}.mp3`,
    }));

    return {
      id: `${SIGN_NUMBER}_q${qi+1}`,
      question_amharic: q.question_amharic,
      question_audio: `${SIGN_NUMBER}_q${qi+1}_question.mp3`,
      explanation_correct_amharic: `${prefix} ${cleanCorrect}`,
      explanation_wrong_amharic: q.explanation_wrong_amharic,
      explanation_correct_audio: `${SIGN_NUMBER}_q${qi+1}_correct.mp3`,
      explanation_wrong_audio: `${SIGN_NUMBER}_q${qi+1}_wrong.mp3`,
      answers,
    };
  });

  // Step 4: Delete old audio + update signs.json
  deleteOldAudio(SIGN_NUMBER);
  signs[signIdx] = { ...sign, name_amharic, explanation_amharic, questions: newQuestions };
  writeFileSync(SIGNS_PATH, JSON.stringify(signs, null, 2), 'utf8');
  console.log(`\n✅ signs.json updated for sign ${SIGN_NUMBER}`);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
