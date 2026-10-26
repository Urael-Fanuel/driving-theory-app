/**
 * scripts/applyDisclaimerAdvertiserSentence.mjs
 *
 * Puts the owner's pick from planning/disclaimer-israel/options_s3.json in front of the
 * first sentence of section 3, in BOTH places that hold the disclaimer:
 *   components/shared/DisclaimerModal.tsx   (shown)
 *   scripts/generateDisclaimerAudio.mjs     (read aloud)
 * Stops before writing anything if the current first sentence is not found exactly once
 * in each file, or if the pick has an unexpected character. Backups go to
 * planning/disclaimer-israel/backup/.
 *
 * Usage:  node scripts/applyDisclaimerAdvertiserSentence.mjs --pick=1 [--dry]
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const ROOT  = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR   = path.join(ROOT, 'planning', 'disclaimer-israel');
const FILES = ['components/shared/DisclaimerModal.tsx', 'scripts/generateDisclaimerAudio.mjs'].map(f => path.join(ROOT, f));
const DRY   = process.argv.includes('--dry');
const die   = m => { console.error('❌ ' + m); process.exit(1); };

const o = JSON.parse(fs.readFileSync(path.join(DIR, 'options_s3.json'), 'utf8'));
const n = Number((process.argv.find(a => a.startsWith('--pick=')) ?? '').split('=')[1]);
const pick = o.options[n - 1];
if (!Number.isInteger(n) || !pick) die(`--pick must be a number from 1 to ${o.options.length}`);
for (const ch of pick) {
  const cp = ch.codePointAt(0);
  if (!(cp === 0x20 || (cp >= 0x1200 && cp <= 0x137F))) die(`the pick has a character that is not Ethiopic or a space: U+${cp.toString(16)}`);
}
const first = o.firstSentenceNow;
const originals = FILES.map(f => fs.readFileSync(f, 'utf8'));
const updated = originals.map((t, i) => {
  const count = t.split(first).length - 1;
  if (count !== 1) die(`${path.basename(FILES[i])}: the first sentence of section 3 was found ${count} times (expected 1). Nothing was changed.`);
  if (t.includes(pick)) die(`${path.basename(FILES[i])} already contains this sentence. Nothing was changed.`);
  return t.replace(first, () => `${pick}። ${first}`);
});
console.log(`OK: the sentence goes in front of "section 3, sentence 1" in ${FILES.length} files.`);
if (DRY) { console.log('(dry run: nothing written)'); process.exit(0); }
fs.mkdirSync(path.join(DIR, 'backup'), { recursive: true });
FILES.forEach((f, i) => fs.writeFileSync(path.join(DIR, 'backup', path.basename(f) + '.before_s3'), originals[i], 'utf8'));
FILES.forEach((f, i) => fs.writeFileSync(f, updated[i], 'utf8'));
console.log('✅ Applied. Next: node --env-file=.env scripts/generateDisclaimerAudio.mjs');
