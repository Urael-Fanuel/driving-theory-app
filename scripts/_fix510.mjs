/**
 * _fix510.mjs
 * Fixes sign 510: "תחנת הסעה לחיילים להעלאה ולהורדה בלבד"
 * Designated stop for authorized vehicles only (military transport pickup/dropoff).
 * Private vehicles may not park here.
 *
 * Run:
 *   node --env-file=.env scripts/_fix510.mjs
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
  const signIdx = signs.findIndex(s => s.image_filename === '510.png');
  if (signIdx === -1) { console.error('Sign 510 not found'); process.exit(1); }

  const sign = signs[signIdx];

  const imagePath = join(ROOT, 'assets', 'images', 'תמרורי תחבורה ציבורית', '510.png');
  if (!existsSync(imagePath)) { console.error('Image not found:', imagePath); process.exit(1); }

  console.log('🔧 Fixing sign 510...');

  // Step 1: Generate name + explanation
  const namePrompt = `אתה מתרגם לאמהרית (געז).

התמרור בתמונה הוא תמרור ישראלי מספר 510.
משמעותו המדויקת: "תחנת הסעה לחיילים — להעלאה ולהורדה בלבד".
הסבר: מקום ייעודי לעצירת רכבי הסעה המובילים חיילים, לצורך עלייה וירידה בלבד. רכב פרטי אינו רשאי לחנות במקום זה.

תרגם לאמהרית:
1. שם קצר (עד 10 מילים): "תחנת הסעה לחיילים — להעלאה ולהורדה בלבד"
2. הסבר (2-3 משפטים): מקום זה מיועד אך ורק לעצירת רכבי הסעה המובילים חיילים לצורך עלייה וירידה. רכב פרטי אינו מורשה לחנות כאן. הסדרה זו נועדה לאפשר תנועה סדירה ובטוחה של כלי רכב מורשים.

החזר JSON בלבד:
{"name_amharic": "...", "explanation_amharic": "..."}`;

  const nameRaw = await callGemini(imagePath, namePrompt);
  const nameJson = nameRaw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  const { name_amharic, explanation_amharic } = JSON.parse(nameJson);
  console.log('✅ name_amharic:', name_amharic);
  console.log('✅ explanation_amharic:', explanation_amharic.slice(0, 80));

  // Step 2: Generate MoT-style Q&A
  const qaPrompt = `אתה מומחה למבחני תיאוריה ישראליים ולשפת אמהרית (געז).

מצורפת תמונה של תמרור ישראלי מספר 510: "תחנת הסעה לחיילים — להעלאה ולהורדה בלבד".
המקום מיועד לעצירת רכבי הסעה לחיילים בלבד. רכב פרטי אינו רשאי לחנות שם.

שם באמהרית: "${name_amharic}"
הסבר באמהרית: "${explanation_amharic}"

צור 3 שאלות מבחן תיאוריה בסגנון משרד התחבורה, מתורגמות לאמהרית:
- שאלה 1: "מה פירוש תמרור זה?"
- שאלה 2: "האם רכב פרטי רשאי לחנות במקום המסומן בתמרור זה?"
- שאלה 3: "לאיזה כלי רכב מיועדת תחנה זו?"

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
  const signNumber = 510;
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
  console.log('\n✅ signs.json updated for sign 510');
  console.log('\nNext steps:');
  console.log('  1. npx tsx scripts/generateAllAudio.ts');
  console.log('  2. node --env-file=.env scripts/uploadNewAudio.mjs --from=510 --to=510');
}

main().catch(e => { console.error('❌', e); process.exit(1); });
