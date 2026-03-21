/**
 * fixDoubledPrefixes.mjs
 * Fixes doubled prefixes in explanation_correct_amharic and explanation_wrong_amharic
 * for all signs in the prohibitions topic.
 *
 * Usage:
 *   node scripts/fixDoubledPrefixes.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const signsPath = path.join(__dirname, '..', 'content', 'signs.json');

const TOPIC = 'prohibitions';

// Read CORRECT_PREFIXES and WRONG_PREFIX directly from addPrefixesAndShuffle.mjs
// to avoid any character encoding issues when hardcoding Amharic strings.
const shuffleSource = fs.readFileSync(path.join(__dirname, 'addPrefixesAndShuffle.mjs'), 'utf8');

// Extract CORRECT_PREFIXES array values
const correctMatch = shuffleSource.match(/const CORRECT_PREFIXES = \[([\s\S]*?)\];/);
const CORRECT_PREFIXES = correctMatch[1]
  .split('\n')
  .map(line => line.match(/'([^']+)'/)?.[1])
  .filter(Boolean);

// Extract WRONG_PREFIX value
const wrongMatch = shuffleSource.match(/const WRONG_PREFIX = '([^']+)'/);
const WRONG_PREFIX = wrongMatch[1];

console.log('Loaded prefixes from addPrefixesAndShuffle.mjs:');
console.log('  WRONG_PREFIX:', JSON.stringify(WRONG_PREFIX));
console.log('  CORRECT_PREFIXES:', CORRECT_PREFIXES.length, 'entries');

const data = JSON.parse(fs.readFileSync(signsPath, 'utf8'));

let fixedCorrect = 0;
let fixedWrong = 0;

const updated = data.map(sign => {
  if (sign.topic_id !== TOPIC) return sign;

  return {
    ...sign,
    questions: sign.questions.map((q) => {
      let correct = q.explanation_correct_amharic || '';
      let wrong   = q.explanation_wrong_amharic   || '';

      // Fix WRONG: if starts with WRONG_PREFIX twice, remove the outer one
      if (wrong.startsWith(WRONG_PREFIX + WRONG_PREFIX)) {
        wrong = wrong.slice(WRONG_PREFIX.length);
        fixedWrong++;
      }

      // Fix CORRECT: strip one outer CORRECT_PREFIX if there are two consecutive prefixes
      let strippedOnce = false;
      for (const prefix of CORRECT_PREFIXES) {
        if (correct.startsWith(prefix)) {
          const afterFirst = correct.slice(prefix.length);
          // Check if what follows also starts with a known prefix (doubled)
          const hasSecondPrefix = CORRECT_PREFIXES.some(p2 => afterFirst.startsWith(p2));
          if (hasSecondPrefix) {
            correct = afterFirst;
            fixedCorrect++;
            strippedOnce = true;
            break;
          }
        }
      }

      return { ...q, explanation_correct_amharic: correct, explanation_wrong_amharic: wrong };
    }),
  };
});

fs.writeFileSync(signsPath, JSON.stringify(updated, null, 2), 'utf8');
console.log(`\n✅ Fixed ${fixedCorrect} correct explanations and ${fixedWrong} wrong explanations`);

// Verify first sign
const verify = JSON.parse(fs.readFileSync(signsPath, 'utf8'));
const first = verify.filter(s => s.topic_id === TOPIC)[0];
console.log('\n--- Verification (first sign) ---');
first.questions.forEach((q, i) => {
  console.log(`Q${i+1} ✅ ${q.explanation_correct_amharic.substring(0, 80)}`);
  console.log(`Q${i+1} ❌ ${q.explanation_wrong_amharic.substring(0, 80)}`);
});
