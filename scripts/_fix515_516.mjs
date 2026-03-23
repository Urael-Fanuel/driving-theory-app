/**
 * _fix515_516.mjs
 * Fixes signs 515 and 516 with official Hebrew descriptions.
 *
 * Sign 515: נתיב לתחבורה ציבורית — קו רציף כפול משולב עם מעוינים בצבע צהוב.
 *   חציית הקווים אסורה. הנסיעה בנתיב מותרת לרכב לפי תמרור 230/501 או לרכב הפונה
 *   בצומת הקרוב לפי סימון 514. עצירה/חנייה אסורות אלא אם צויין אחרת.
 *
 * Sign 516: נתיב לתחבורה ציבורית, חציה אל ומהנתיב — קו קטעים ליד קו רציף משולב
 *   עם מעוינים בצבע צהוב. חציית הקווים מותרת רק אם חציית קו הקטעים קודמת לחציית
 *   הקו הרציף. הנסיעה/עצירה/חנייה — כמו 515.
 *
 * Run:
 *   node --env-file=.env scripts/_fix515_516.mjs
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

const SIGNS_DATA = {
  '515': {
    hebrew_description: `נתיב לתחבורה ציבורית:
קו רציף כפול משולב עם מעוינים בצבע צהוב — חציית הקווים אסורה.
הנסיעה בנתיב מותרת לרכב על פי המצוין בתמרור 230 או בתמרור 501, או לרכב הפונה בצומת הקרוב על פי סימון 514.
עצירה או חנייה של כלי רכב בנתיב אסורים, אלא אם צויין אחרת.`,
    questions_context: [
      'מה פירוש קו רציף כפול עם מעוינים צהובים?',
      'מי רשאי לנסוע בנתיב תחבורה ציבורית המסומן בקווים אלו?',
      'האם מותר לעצור בנתיב תחבורה ציבורית המסומן בתמרור 515?',
    ],
  },
  '516': {
    hebrew_description: `נתיב לתחבורה ציבורית, חציה אל ומהנתיב:
קו קטעים ליד קו רציף משולב עם מעוינים בצבע צהוב.
חציית הקווים מותרת רק אם חציית קו הקטעים קודמת לחציית הקו הרציף.
הנסיעה בנתיב מותרת לרכב על פי המצוין בתמרור 230 או בתמרור 501, או רכב הפונה בצומת הקרוב על פי סימון 514.
עצירה או חנייה של כלי רכב בנתיב אסורים, אלא אם צוין אחרת.`,
    questions_context: [
      'מה מאפשר קו הקטעים ביחס לקו הרציף בסימון זה?',
      'באיזה סדר חייב לעבור כלי רכב את הקווים בתמרור 516?',
      'מי רשאי לנסוע בנתיב המסומן בתמרור 516?',
    ],
  },
};

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

async function fixSign(signs, signNumber) {
  const signIdx = signs.findIndex(s => s.image_filename === `${signNumber}.png`);
  if (signIdx === -1) { console.error(`Sign ${signNumber} not found`); return; }

  const sign = signs[signIdx];
  const imagePath = join(ROOT, 'assets', 'images', 'תמרורי תחבורה ציבורית', `${signNumber}.png`);
  if (!existsSync(imagePath)) { console.error('Image not found:', imagePath); return; }

  const { hebrew_description, questions_context } = SIGNS_DATA[signNumber];

  console.log(`\n🔧 Fixing sign ${signNumber}...`);

  // Step 1: Translate name + explanation
  const namePrompt = `אתה מתרגם לאמהרית (געז).

להלן התיאור הרשמי של תמרור ישראלי מספר ${signNumber}:

"""
${hebrew_description}
"""

תרגם לאמהרית:
1. שם קצר (עד 12 מילים) — שמור על המשמעות המדויקת
2. הסבר מלא (3-4 משפטים) — תרגם את כל הנקודות בדיוק

החזר JSON בלבד:
{"name_amharic": "...", "explanation_amharic": "..."}`;

  const nameRaw = await callGemini(imagePath, namePrompt);
  const nameJson = nameRaw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  const { name_amharic, explanation_amharic } = JSON.parse(nameJson);
  console.log('✅ name_amharic:', name_amharic);
  console.log('✅ explanation_amharic:', explanation_amharic.slice(0, 100));

  // Step 2: Generate MoT-style Q&A
  const qaPrompt = `אתה מומחה למבחני תיאוריה ישראליים ולשפת אמהרית (געז).

מצורפת תמונה של תמרור ישראלי מספר ${signNumber}.

━━━ תיאור רשמי ━━━
${hebrew_description}

━━━ שם באמהרית ━━━
${name_amharic}

━━━ הסבר באמהרית ━━━
${explanation_amharic}

צור 3 שאלות מבחן תיאוריה בסגנון משרד התחבורה, מתורגמות לאמהרית.
הנושאים לשאלות:
1. ${questions_context[0]}
2. ${questions_context[1]}
3. ${questions_context[2]}

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

  // Step 3: Build questions
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
      prefixBase, qi
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

  deleteOldAudio(signNumber);
  signs[signIdx] = { ...sign, name_amharic, explanation_amharic, questions: newQuestions };
  console.log(`✅ signs.json updated for sign ${signNumber}`);
}

async function main() {
  const signs = JSON.parse(readFileSync(SIGNS_PATH, 'utf8'));
  await fixSign(signs, '515');
  await fixSign(signs, '516');
  writeFileSync(SIGNS_PATH, JSON.stringify(signs, null, 2), 'utf8');
  console.log('\n✅ Both signs saved to signs.json');
}

main().catch(e => { console.error('❌', e); process.exit(1); });
