/**
 * fixQuestion1.mjs
 * Rewrites ONLY Q1 question text + correct answer text for a sign.
 * Does NOT touch wrong answers, explanations, or any other question.
 *
 * Usage:
 *   node --env-file=.env scripts/fixQuestion1.mjs --sign-number 425
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const signNumArg = process.argv.find((a, i) => process.argv[i - 1] === '--sign-number');
if (!signNumArg) { console.error('Usage: node fixQuestion1.mjs --sign-number 425'); process.exit(1); }
const SIGN_NUMBER = signNumArg;

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-2.5-flash';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

function findOurImagePath(sign) {
  const folders = readdirSync(join(ROOT, 'assets', 'images'))
    .map(f => join(ROOT, 'assets', 'images', f));
  for (const folder of folders) {
    const base = sign.image_filename.replace(/\.(png|jpg)$/i, '');
    for (const ext of ['.png', '.jpg', '.jpeg']) {
      const p = join(folder, base + ext);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

async function rewriteQ1(sign, q1) {
  const imgPath = findOurImagePath(sign);
  const imageBuffer = readFileSync(imgPath);
  const base64 = imageBuffer.toString('base64');

  const prompt = `אתה מומחה לתמרורי ישראל ולשפת אמהרית (געז).

━━━ זהות התמרור ━━━
שם עברי: "${sign.name_hebrew}"
שם באמהרית: "${sign.name_amharic}"
הסבר באמהרית: "${sign.explanation_amharic}"

━━━ השאלה הנוכחית (לא ברורה — יש לנסח מחדש) ━━━
שאלה: "${q1.question_amharic}"
תשובה נכונה: "${q1.answers.find(a => a.is_correct).text_amharic}"

המשימה: נסח מחדש את השאלה ואת התשובה הנכונה בצורה ברורה ומובנת לדוברי אמהרית.
- השאלה חייבת להיות פשוטה וברורה
- התשובה הנכונה חייבת להיות ישירה ומובנת
- אל תשנה כלום אחר

החזר ONLY JSON ללא שום טקסט נוסף:
{
  "question_amharic": "...",
  "correct_answer_amharic": "..."
}`;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [
        { inline_data: { mime_type: 'image/png', data: base64 } },
        { text: prompt },
      ]}],
      generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
    }),
  });
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const textPart = parts.find(p => p.text) || parts[0];
  const text = textPart?.text?.trim() || '';
  const jsonStr = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').replace(/\r?\n/g, ' ').trim();
  return JSON.parse(jsonStr);
}

async function main() {
  console.log(`\n🔄 fixQuestion1.mjs — Sign ${SIGN_NUMBER}`);
  console.log('═'.repeat(50));

  const signsPath = join(ROOT, 'content', 'signs.json');
  const signs = JSON.parse(readFileSync(signsPath, 'utf8'));
  const sign = signs.find(s => s.image_filename === `${SIGN_NUMBER}.png`);
  if (!sign) { console.error(`❌ Sign ${SIGN_NUMBER} not found`); process.exit(1); }

  const q1 = sign.questions[0];
  console.log(`📝 Current Q1: ${q1.question_amharic}`);
  console.log(`✓  Current correct answer: ${q1.answers.find(a=>a.is_correct).text_amharic}`);

  console.log('\n🤖 Rewriting Q1 via Gemini...');
  const result = await rewriteQ1(sign, q1);
  console.log(`✅ New question: ${result.question_amharic}`);
  console.log(`✅ New correct answer: ${result.correct_answer_amharic}`);

  // Update only question text + correct answer text
  q1.question_amharic = result.question_amharic;
  const correctAnswer = q1.answers.find(a => a.is_correct);
  correctAnswer.text_amharic = result.correct_answer_amharic;

  // Delete old Q1 audio files
  const audioDir = join(ROOT, 'assets', 'audio');
  const toDelete = [
    `${SIGN_NUMBER}_q1_question.mp3`,
    `answer_${SIGN_NUMBER}_q1_${correctAnswer.id}.mp3`,
  ];
  toDelete.forEach(f => {
    const p = join(audioDir, f);
    if (existsSync(p)) { unlinkSync(p); console.log(`🗑️  Deleted: ${f}`); }
  });

  writeFileSync(signsPath, JSON.stringify(signs, null, 2));
  console.log(`✅ signs.json updated (only Q1 question + correct answer)`);

  console.log('\n' + '═'.repeat(50));
  console.log('✅ Done! Next steps:');
  console.log('   1. npx tsx scripts/generateAllAudio.ts');
  console.log(`   2. node --env-file=.env scripts/uploadNewAudio.mjs --from=${SIGN_NUMBER} --to=${SIGN_NUMBER}`);
}

main().catch(e => { console.error('❌ Fatal:', e.message); process.exit(1); });
