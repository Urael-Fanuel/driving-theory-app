/**
 * fixRightOfWayExplanations.mjs
 * Rebuilds explanation_correct and explanation_wrong from CLEAN sources:
 *   - explanation_correct = [varied prefix] + first sentence of sign.explanation_amharic
 *   - explanation_wrong   = wrong prefix + text of the is_correct=true answer
 * Also shuffles answers so correct is evenly distributed across cards 1-4.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath  = path.join(__dirname, '..', 'content', 'signs.json');

const sb = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// ── 9 correct prefixes ────────────────────────────────────────────────────────
const CORRECT_PREFIXES = [
  'ትክክል! ይህ ምልክት ',
  'ትክክል! ጥሩ ነው። ',
  'አሪፍ! ምልክቱ ',
  'ግበዝ። ',
  'በጣም ጥሩ። ',
  'ልክ ኖት። ',
  'ዋው በጣም ጥሩ። ',
  'እንዲያ ነው የኔ ግቨዝ። ',
  'እሰይ። አቤት እውቀት! ',
];

const WRONG_PREFIX = 'ስህተት! ትክክለኛው መልስ: ';

// ── Extract first sentence from a text (up to first "።") ─────────────────────
function firstSentence(text) {
  if (!text) return text;
  const idx = text.indexOf('።');
  return idx >= 0 ? text.substring(0, idx + 1) : text.split('.')[0];
}

// ── Shuffle: correct answer guaranteed at targetPos ───────────────────────────
function shuffleToPosition(answers, targetPos) {
  const arr        = [...answers];
  const correctIdx = arr.findIndex(a => a.is_correct);
  [arr[correctIdx], arr[targetPos]] = [arr[targetPos], arr[correctIdx]];
  const others = [0, 1, 2, 3].filter(i => i !== targetPos);
  const nonC   = others.map(i => arr[i]);
  for (let i = nonC.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [nonC[i], nonC[j]] = [nonC[j], nonC[i]];
  }
  others.forEach((pos, i) => { arr[pos] = nonC[i]; });
  return arr;
}

function getTargetPos(signIdx, qIdx) { return (signIdx * 3 + qIdx) % 4; }

// ── Fetch data from DB ────────────────────────────────────────────────────────
console.log('📥 Fetching signs from DB...');
const { data: dbSigns } = await sb
  .from('signs')
  .select('id, explanation_amharic')
  .eq('topic_id', 'right_of_way');

const signExplanation = {};
dbSigns.forEach(s => { signExplanation[s.id] = s.explanation_amharic; });

console.log('📥 Fetching questions from DB...');
const { data: dbQuestions } = await sb
  .from('questions')
  .select('id, sign_id, answers')
  .eq('topic_id', 'right_of_way')
  .order('id');

console.log(`   Found ${dbQuestions.length} questions`);

// Group by sign_id
const bySign = {};
dbQuestions.forEach(q => { (bySign[q.sign_id] ??= []).push(q); });

// ── Build updates ─────────────────────────────────────────────────────────────
const updates = {};
let signIdx = 0;

for (const [signId, qs] of Object.entries(bySign)) {
  qs.sort((a, b) => a.id.localeCompare(b.id));
  const explBase = firstSentence(signExplanation[signId] ?? '');

  qs.forEach((q, qi) => {
    // Correct answer text (for wrong explanation)
    const correctAnswer = q.answers.find(a => a.is_correct);
    const correctText   = correctAnswer?.text_amharic ?? '';

    // Choose prefix
    const prefixIdx  = (signIdx * 3 + qi) % CORRECT_PREFIXES.length;
    const prefix     = CORRECT_PREFIXES[prefixIdx];

    // Build explanation_correct: prefix + first sentence of sign explanation
    // Avoid "ይህ ምልክት ይህ ምልክት" duplication
    let newCorrect;
    if (prefix === 'ትክክል! ይህ ምልክት ' && explBase.startsWith('ይህ ምልክት')) {
      newCorrect = 'ትክክል! ' + explBase;
    } else {
      newCorrect = prefix + explBase;
    }

    // Build explanation_wrong: WRONG_PREFIX + correct answer text
    const newWrong = WRONG_PREFIX + correctText;

    // Shuffle answers
    const targetPos      = getTargetPos(signIdx, qi);
    const shuffledAnswers = shuffleToPosition(q.answers, targetPos);

    updates[q.id] = { newCorrect, newWrong, shuffled: shuffledAnswers };
  });

  signIdx++;
}

// ── Update signs.json ─────────────────────────────────────────────────────────
const signsData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
fs.writeFileSync(filePath + '.backup', JSON.stringify(signsData, null, 2), 'utf8');

const updatedSigns = signsData.map(sign => {
  if (sign.topic_id !== 'right_of_way') return sign;
  return {
    ...sign,
    questions: sign.questions.map(q => {
      const u = updates[q.id];
      if (!u) return q;
      return {
        ...q,
        explanation_correct_amharic: u.newCorrect,
        explanation_wrong_amharic:   u.newWrong,
        answers:                     u.shuffled,
      };
    }),
  };
});
fs.writeFileSync(filePath, JSON.stringify(updatedSigns, null, 2), 'utf8');
console.log('✅ signs.json updated');

// ── Upload to DB ──────────────────────────────────────────────────────────────
console.log('📤 Uploading to DB...');
let uploaded = 0;
for (const [qId, u] of Object.entries(updates)) {
  const { error } = await sb.from('questions').update({
    explanation_correct_amharic: u.newCorrect,
    explanation_wrong_amharic:   u.newWrong,
    answers:                     u.shuffled,
  }).eq('id', qId);
  if (error) console.error(`  ❌ ${qId}:`, error.message);
  else uploaded++;
}
console.log(`✅ DB updated: ${uploaded} questions`);

// ── Verify ────────────────────────────────────────────────────────────────────
const verify   = JSON.parse(fs.readFileSync(filePath, 'utf8'));
const rowSigns = verify.filter(s => s.topic_id === 'right_of_way');
const posDist  = { card1: 0, card2: 0, card3: 0, card4: 0 };
rowSigns.forEach(s => s.questions.forEach(q => {
  const idx = q.answers.findIndex(a => a.is_correct);
  posDist[`card${idx + 1}`]++;
}));

console.log('\n📊 Correct answer distribution:', posDist);

const s0 = rowSigns[0];
console.log('\n── Sample sign:', s0.id);
s0.questions.forEach((q, i) => {
  console.log(`  Q${i+1} ✅ ${q.explanation_correct_amharic}`);
  console.log(`  Q${i+1} ❌ ${q.explanation_wrong_amharic}`);
  console.log(`  Q${i+1} 🔀 ${q.answers.map(a => a.id + (a.is_correct ? '✓' : '')).join(', ')}`);
});
