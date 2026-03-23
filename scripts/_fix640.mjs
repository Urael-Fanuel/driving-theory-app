/**
 * _fix640.mjs
 * Fixes sign 640: correct meaning is "end of pedestrian zone (cancels sign 639)"
 * Updates: name_amharic + explanation_amharic + 3 MoT-style questions
 *
 * Run:
 *   node --env-file=.env scripts/_fix640.mjs
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
  const signIdx = signs.findIndex(s => s.image_filename === '640.png');
  if (signIdx === -1) { console.error('Sign 640 not found'); process.exit(1); }

  const sign = signs[signIdx];

  // Find image
  const imagePath = join(ROOT, 'assets', 'images', 'תמרורי מודיעין והדרכה', '640.png');
  if (!existsSync(imagePath)) { console.error('Image not found:', imagePath); process.exit(1); }

  console.log('🔧 Fixing sign 640...');
  console.log('Correct meaning: end of pedestrian zone — cancels sign 639');

  // Step 1: Generate name + explanation in Amharic
  const namePrompt = `אתה מתרגם לאמהרית (געז).

התמרור בתמונה הוא תמרור ישראלי מספר 640: "סוף אזור הליכת ילדים".
משמעותו: מבטל את תמרור 639 ("אזור הליכת ילדים"). מסמן את סוף האזור המיוחד שבו הילדים מהלכים.

תרגם לאמהרית:
1. שם קצר (עד 10 מילים): "סוף אזור הליכת ילדים — מבטל את תמרור 639"
2. הסבר (2-3 משפטים): תמרור זה מסמן את סוף האזור המיוחד שהוגדר על ידי תמרור 639. הוא מבטל את ההוראות של תמרור 639 ומחזיר את כללי הנהיגה הרגילים. אחרי תמרור זה, אין יותר צורך בזהירות מיוחדת עבור ילדים הולכי רגל.

החזר JSON בלבד:
{"name_amharic": "...", "explanation_amharic": "..."}`;

  const nameRaw = await callGemini(imagePath, namePrompt);
  const nameJson = nameRaw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  console.log('RAW name response:', nameJson.slice(0, 300));
  const { name_amharic, explanation_amharic } = JSON.parse(nameJson);
  console.log('✅ name_amharic:', name_amharic);
  console.log('✅ explanation_amharic:', explanation_amharic.slice(0, 80));

  // Step 2: Generate MoT-style Q&A
  const qaPrompt = `אתה מומחה למבחני תיאוריה ישראליים ולשפת אמהרית (געז).

מצורפת תמונה של תמרור ישראלי מספר 640: "סוף אזור הליכת ילדים".
משמעותו: מבטל את תמרור 639 ומסמן את סוף האזור המיוחד לילדים הולכי רגל.

שם באמהרית: "${name_amharic}"
הסבר באמהרית: "${explanation_amharic}"

צור 3 שאלות מבחן תיאוריה בסגנון משרד התחבורה, מתורגמות לאמהרית:
- שאלה 1: "מה פירוש התמרור?"
- שאלה 2: "מה מורה התמרור לאחר מעברו?"
- שאלה 3: שאלה על הקשר בין תמרור 639 ל-640

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

  // Step 3: Build questions array with correct structure
  const signNumber = 640;
  // Global sign index for prefix rotation (use signIdx in signs array)
  const prefixBase = signIdx;

  const newQuestions = questions.map((q, qi) => {
    const prefixIdx = (prefixBase * 3 + qi) % CORRECT_PREFIXES.length;
    const prefix = CORRECT_PREFIXES[prefixIdx];

    // Strip old prefix from explanation_correct if Gemini added one
    const cleanCorrect = q.explanation_correct_amharic
      .replace(/^(ትክክל!|አዎ!|እሰይ የኔ ጎቨዝ[።!]?|ትክክל፥ አቬት እውቀት[።!]?|ጎሽ[።!]?|እንድያ ነው[።!]?|አቬት ችሎታ፥ ትክክл[።!]?|በጣም አሪፍ[።!]?|ትክክл[።!]?)\s*/u, '')
      .replace(/^ትክክл!\s*/u, '');

    const answers = shuffleAnswers(
      q.answers.map((a, ai) => ({
        id: ['A','B','C','D'][ai],
        text_amharic: a.text_amharic,
        is_correct: a.is_correct,
        audio_filename: `answer_${signNumber}_q${qi+1}_A.mp3`, // placeholder, will be fixed below
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

  // Step 4: Update sign in signs.json
  signs[signIdx] = {
    ...sign,
    name_amharic,
    explanation_amharic,
    questions: newQuestions,
  };

  writeFileSync(SIGNS_PATH, JSON.stringify(signs, null, 2), 'utf8');
  console.log('\n✅ signs.json updated for sign 640');
  console.log('\nNext steps:');
  console.log('  1. npx tsx scripts/generateAllAudio.ts');
  console.log('  2. node --env-file=.env scripts/uploadNewAudio.mjs --from=640 --to=640');
}

main().catch(e => { console.error('❌', e); process.exit(1); });
