/**
 * _fix511.mjs
 * Fixes sign 511:
 * Red-yellow painted curb = stopping forbidden for all vehicles,
 * EXCEPT the vehicle type authorized by a sign — for pickup/dropoff only.
 *
 * Run:
 *   node --env-file=.env scripts/_fix511.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SIGNS_PATH = join(ROOT, 'content', 'signs.json');

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

function shuffleAnswers(answers, signIdx, qIdx) {
  const ids = ['A', 'B', 'C', 'D'];
  const targetPos = (signIdx * 3 + qIdx) % 4;
  const correctIdx = answers.findIndex(a => a.is_correct);
  const shuffled = [...answers];
  [shuffled[targetPos], shuffled[correctIdx]] = [shuffled[correctIdx], shuffled[targetPos]];
  return shuffled.map((a, i) => ({ ...a, id: ids[i] }));
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
  const signIdx = signs.findIndex(s => s.image_filename === '511.png');
  if (signIdx === -1) { console.error('Sign 511 not found'); process.exit(1); }

  const sign = signs[signIdx];
  const imagePath = join(ROOT, 'assets', 'images', 'תמרורי תחבורה ציבורית', '511.png');
  if (!existsSync(imagePath)) { console.error('Image not found:', imagePath); process.exit(1); }

  console.log('🔧 Fixing sign 511...');

  // Step 1: Generate name + explanation
  const namePrompt = `אתה מומחה לתמרורי ישראל ומתרגם לאמהרית (געז).

התמרור בתמונה הוא תמרור ישראלי מספר 511.
המשמעות המדויקת:
- אבני שפה צבועות אדום-צהוב: אסורה עצירה לכל כלי רכב.
- פרט לסוג הרכב שעצירתו הותרה על ידי תמרור ייעודי — ורק לצורך העלאה והורדת נוסעים בלבד.

תרגם לאמהרית:
1. שם קצר (עד 10 מילים): "אדום-צהוב: אסורה עצירה — פרט לרכב מורשה להעלאה/הורדה"
2. הסבר (2-3 משפטים): אבני השפה הצבועות אדום-צהוב מסמנות אזור שבו אסורה עצירה לכל כלי רכב. רק רכב שסוגו הותר על ידי תמרור מיוחד רשאי לעצור, וזאת לצורך העלאה והורדת נוסעים בלבד. חנייה אסורה לכולם ללא יוצא מן הכלל.

החזר JSON בלבד:
{"name_amharic": "...", "explanation_amharic": "..."}`;

  const nameRaw = await callGemini(imagePath, namePrompt);
  const nameJson = nameRaw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  const { name_amharic, explanation_amharic } = JSON.parse(nameJson);
  console.log('✅ name_amharic:', name_amharic);
  console.log('✅ explanation_amharic:', explanation_amharic.slice(0, 80));

  // Step 2: Generate MoT-style Q&A
  const qaPrompt = `אתה מומחה למבחני תיאוריה ישראליים ולשפת אמהרית (געז).

מצורפת תמונה של תמרור ישראלי מספר 511.
אבני שפה אדום-צהוב: אסורה עצירה לכל כלי רכב, פרט לסוג הרכב שהותר בתמרור — לצורך העלאה והורדת נוסעים בלבד.

שם באמהרית: "${name_amharic}"
הסבר באמהרית: "${explanation_amharic}"

צור 3 שאלות מבחן תיאוריה בסגנון משרד התחבורה, מתורגמות לאמהרית:
- שאלה 1: "מה משמעות אבני שפה צבועות אדום-צהוב?"
- שאלה 2: "מי רשאי לעצור ליד אבני שפה אדום-צהוב?"
- שאלה 3: "מה מותר לרכב המורשה לעשות ליד אבני שפה אלו?"

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
  const signNumber = 511;
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
        audio_filename: `answer_${signNumber}_q${qi+1}_${'ABCD'[ai]}.mp3`,
      })),
      prefixBase,
      qi
    ).map((a, ai) => ({
      ...a,
      id: ['A','B','C','D'][ai],
      audio_filename: `answer_${signNumber}_q${qi+1}_${'ABCD'[ai]}.mp3`,
    }));

    return {
      id: `${signNumber}_q${qi+1}`,
      question_amharic: q.question_amharic,
      question_audio: `${signNumber}_q${qi+1}_question.mp3`,
      explanation_correct_amharic: `${prefix} ${cleanCorrect}`,
      explanation_wrong_amharic: q.explanation_wrong_amharic,
      explanation_correct_audio: `${signNumber}_q${qi+1}_correct.mp3`,
      explanation_wrong_audio: `${signNumber}_q${qi+1}_wrong.mp3`,
      answers,
    };
  });

  // Step 4: Update signs.json
  signs[signIdx] = {
    ...sign,
    name_amharic,
    explanation_amharic,
    questions: newQuestions,
  };

  writeFileSync(SIGNS_PATH, JSON.stringify(signs, null, 2), 'utf8');
  console.log('\n✅ signs.json updated for sign 511');
  console.log('\nNext steps:');
  console.log('  1. npx tsx scripts/generateAllAudio.ts');
  console.log('  2. node --env-file=.env scripts/uploadNewAudio.mjs --from=511 --to=511');
}

main().catch(e => { console.error('❌', e); process.exit(1); });
