/**
 * scripts/printSignContent.mjs
 *
 * Prints a single sign's learning content in clean, readable form —
 * no JSON, no code syntax — for manual Amharic review in the terminal.
 *
 * Usage:
 *   node scripts/printSignContent.mjs PROHIBITION_403
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SIGNS_PATH = join(ROOT, 'content', 'signs.json');

const signId = process.argv[2];
if (!signId) {
  console.error('שימוש: node scripts/printSignContent.mjs <SIGN_ID>');
  process.exit(1);
}

const signs = JSON.parse(readFileSync(SIGNS_PATH, 'utf-8'));
const sign = signs.find((s) => s.id === signId);

if (!sign) {
  console.error(`לא נמצא תמרור עם המזהה: ${signId}`);
  process.exit(1);
}

// Ge'ez letters — same convention used in temp_behavioral/geminiTranslate.mjs
const LETTERS = ['ሀ', 'ለ', 'ሐ', 'መ'];

console.log(`\n=== תמרור ${sign.name_hebrew} (${sign.id}) ===\n`);
console.log('[NAME]');
console.log(sign.name_amharic || '(ריק)');
console.log('');
console.log('[EXPLANATION]');
console.log(sign.explanation_amharic || '(ריק)');
console.log('');
console.log('[QUESTIONS]');

(sign.questions || []).forEach((q, i) => {
  console.log('');
  console.log(`${i + 1}. ${q.question_amharic || '(ריק)'}`);
  (q.answers || []).forEach((a, ai) => {
    const mark = a.is_correct ? ' (✓)' : '';
    console.log(`${LETTERS[ai] || ai + 1}. ${a.text_amharic}${mark}`);
  });
});
console.log('');
