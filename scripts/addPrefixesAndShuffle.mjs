/**
 * addPrefixesAndShuffle.mjs
 * Simple script - ONLY does 2 things to right_of_way questions in signs.json:
 * 1. Adds varied prefix to explanation_correct and explanation_wrong
 * 2. Shuffles answers so correct is evenly spread across cards 1-4
 * Does NOT touch any other content.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath  = path.join(__dirname, '..', 'content', 'signs.json');

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

// Guarantee correct answer at targetPos, shuffle others randomly
function shuffleToPosition(answers, targetPos) {
  const arr        = [...answers];
  const correctIdx = arr.findIndex(a => a.is_correct);
  [arr[correctIdx], arr[targetPos]] = [arr[targetPos], arr[correctIdx]];
  const others = [0,1,2,3].filter(i => i !== targetPos);
  const nonC   = others.map(i => arr[i]);
  for (let i = nonC.length-1; i > 0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [nonC[i],nonC[j]] = [nonC[j],nonC[i]];
  }
  others.forEach((pos, i) => { arr[pos] = nonC[i]; });
  return arr;
}

// Even distribution: 10 signs × 3 questions → each of 4 positions gets 7-8
function getTargetPos(signIdx, qIdx) { return (signIdx * 3 + qIdx) % 4; }

const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

let signIdx = 0;
const updated = data.map(sign => {
  if (sign.topic_id !== 'right_of_way') return sign;
  const si = signIdx++;
  return {
    ...sign,
    questions: sign.questions.map((q, qi) => {
      const prefixIdx = (si * 3 + qi) % CORRECT_PREFIXES.length;
      const prefix    = CORRECT_PREFIXES[prefixIdx];

      // Smart: avoid "ይህ ምልክት ይህ ምልክት" duplication
      let newCorrect;
      if (prefix === 'ትክክል! ይህ ምልክት ' && q.explanation_correct_amharic.startsWith('ይህ ምልክት')) {
        newCorrect = 'ትክክل! ' + q.explanation_correct_amharic;
      } else {
        newCorrect = prefix + q.explanation_correct_amharic;
      }

      const newWrong = WRONG_PREFIX + q.explanation_wrong_amharic;

      return {
        ...q,
        explanation_correct_amharic: newCorrect,
        explanation_wrong_amharic:   newWrong,
        answers: shuffleToPosition(q.answers, getTargetPos(si, qi)),
      };
    }),
  };
});

fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf8');

// Verify
const verify  = JSON.parse(fs.readFileSync(filePath, 'utf8'));
const rowSigns = verify.filter(s => s.topic_id === 'right_of_way');
const dist = {card1:0,card2:0,card3:0,card4:0};
rowSigns.forEach(s => s.questions.forEach(q => {
  dist[`card${q.answers.findIndex(a=>a.is_correct)+1}`]++;
}));

console.log('✅ Done! signs.json updated');
console.log('📊 Correct answer distribution:', dist);
const s0 = rowSigns[0];
s0.questions.forEach((q,i) => {
  console.log(`  Q${i+1} ✅ ${q.explanation_correct_amharic.substring(0,70)}`);
  console.log(`  Q${i+1} ❌ ${q.explanation_wrong_amharic.substring(0,70)}`);
  console.log(`  Q${i+1} 🔀 ${q.answers.map(a=>a.id+(a.is_correct?'✓':'')).join(', ')}`);
});
