/**
 * _fix504.mjs
 * Fixes sign 504: correct meaning —
 * White arrow = permitted for ALL vehicles
 * Yellow arrow = permitted ONLY for vehicles authorized by sign 501 (e.g. buses, taxis)
 *
 * Run:
 *   node --env-file=.env scripts/_fix504.mjs
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
  const signIdx = signs.findIndex(s => s.image_filename === '504.png');
  if (signIdx === -1) { console.error('Sign 504 not found'); process.exit(1); }

  const sign = signs[signIdx];

  const imagePath = join(ROOT, 'assets', 'images', 'תמרורי תחבורה ציבורית', '504.png');
  if (!existsSync(imagePath)) { console.error('Image not found:', imagePath); process.exit(1); }

  console.log('🔧 Fixing sign 504...');

  // Step 1: Generate name + explanation
  const namePrompt = `אתה מתרגם לאמהרית (געז).

התמרור בתמונה הוא תמרור ישראלי מספר 504.
משמעותו המדויקת:
- החץ הלבן: התנועה בכיוון המסומן מותרת לכל כלי רכב
- החץ הצהוב: התנועה בכיוון המסומן מותרת רק לרכבים שהותרו להם בתמרור 501 (למשל: אוטובוסים, מוניות, רכבי שירות)

תרגם לאמהרית:
1. שם קצר (עד 10 מילים): "חץ לבן לכל רכב, חץ צהוב לרכבי תמרור 501 בלבד"
2. הסבר (2-3 משפטים): החץ הלבן מתיר תנועה לכל כלי רכב. החץ הצהוב מתיר תנועה רק לרכבים שהותרו בתמרור 501, כגון אוטובוסים ומוניות. אסור לרכב רגיל ללכת בכיוון החץ הצהוב.

החזר JSON בלבד:
{"name_amharic": "...", "explanation_amharic": "..."}`;

  const nameRaw = await callGemini(imagePath, namePrompt);
  const nameJson = nameRaw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  const { name_amharic, explanation_amharic } = JSON.parse(nameJson);
  console.log('✅ name_amharic:', name_amharic);
  console.log('✅ explanation_amharic:', explanation_amharic.slice(0, 80));

  // Step 2: Generate MoT-style Q&A
  const qaPrompt = `אתה מומחה למבחני תיאוריה ישראליים ולשפת אמהרית (געז).

מצורפת תמונה של תמרור ישראלי מספר 504.
משמעותו: החץ הלבן — תנועה מותרת לכל כלי רכב. החץ הצהוב — תנועה מותרת רק לרכבים שהותרו בתמרור 501 (אוטובוסים, מוניות, רכבי שירות).

שם באמהרית: "${name_amharic}"
הסבר באמהרית: "${explanation_amharic}"

צור 3 שאלות מבחן תיאוריה בסגנון משרד התחבורה, מתורגמות לאמהרית:
- שאלה 1: "מה פירוש החץ הלבן בתמרור?"
- שאלה 2: "מי רשאי ללכת בכיוון החץ הצהוב?"
- שאלה 3: "האם רכב פרטי רשאי ללכת בכיוון החץ הצהוב?"

כל שאלה: 4 תשובות (1 נכונה, 3 שגויות אך הגיוניות).

החזר JSON בלבד:
{
  "questions": [
    {
      "index": 1,
      "question_amharic": "...",
      "explanation_correct_amharic": "ትክክל! ...",
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
  const signNumber = 504;
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
  console.log('\n✅ signs.json updated for sign 504');
  console.log('\nNext steps:');
  console.log('  1. npx tsx scripts/generateAllAudio.ts');
  console.log('  2. node --env-file=.env scripts/uploadNewAudio.mjs --from=504 --to=504');
}

main().catch(e => { console.error('❌', e); process.exit(1); });
