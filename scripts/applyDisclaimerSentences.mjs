/**
 * scripts/applyDisclaimerSentences.mjs
 *
 * Applies the owner's pick from planning/disclaimer-israel/options.json (written by
 * translateDisclaimerIsrael.mjs) to BOTH places that hold the disclaimer text:
 *   - components/shared/DisclaimerModal.tsx   (what is shown)
 *   - scripts/generateDisclaimerAudio.mjs     (what is read aloud)
 * Only sentence 2 of section 1 and of section 2 change. Anything unexpected (a sentence
 * not found exactly once, a stray character) stops the script before a single file is
 * written. Originals are copied to planning/disclaimer-israel/backup/ first.
 *
 * Usage:
 *   node scripts/applyDisclaimerSentences.mjs --s1=2 --s2=1
 *   (add --dry to only check and print what would change)
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const ROOT    = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR     = path.join(ROOT, 'planning', 'disclaimer-israel');
const FILES   = ['components/shared/DisclaimerModal.tsx', 'scripts/generateDisclaimerAudio.mjs'].map(f => path.join(ROOT, f));
const arg     = n => (process.argv.find(a => a.startsWith(`--${n}=`)) ?? '').split('=')[1];
const DRY     = process.argv.includes('--dry');
const die     = m => { console.error('❌ ' + m); process.exit(1); };

const opts = JSON.parse(fs.readFileSync(path.join(DIR, 'options.json'), 'utf8'));
const pick = (key, n) => {
  const i = Number(n);
  const o = opts[key]?.options?.[i - 1];
  if (!Number.isInteger(i) || !o) die(`--${key} must be a number from 1 to ${opts[key]?.options?.length}`);
  for (const ch of o) {
    const cp = ch.codePointAt(0);
    if (!(cp === 0x20 || (cp >= 0x1200 && cp <= 0x137F))) die(`option ${key}/${i} contains a character that is not Ethiopic or a space: U+${cp.toString(16)}`);
  }
  if (/[።'"`\\$]/.test(o)) die(`option ${key}/${i} contains punctuation that would break the code`);
  return { from: opts[key].current, to: o };
};
const changes = [pick('s1', arg('s1')), pick('s2', arg('s2'))];

const originals = FILES.map(f => fs.readFileSync(f, 'utf8'));
const updated = originals.map((text, idx) => {
  let t = text;
  for (const c of changes) {
    const n = t.split(c.from).length - 1;
    if (n !== 1) die(`${path.basename(FILES[idx])}: the current sentence was found ${n} times (expected exactly 1). Nothing was changed.`);
    t = t.replace(c.from, () => c.to);
  }
  return t;
});

console.log(`Both files hold each sentence exactly once. Changes: ${changes.length} sentences x ${FILES.length} files.`);
if (DRY) { console.log('(dry run: nothing written)'); process.exit(0); }

fs.mkdirSync(path.join(DIR, 'backup'), { recursive: true });
FILES.forEach((f, i) => fs.writeFileSync(path.join(DIR, 'backup', path.basename(f) + '.before'), originals[i], 'utf8'));
FILES.forEach((f, i) => fs.writeFileSync(f, updated[i], 'utf8'));
console.log('✅ Applied. Originals saved in planning/disclaimer-israel/backup/.');
console.log('Next: node --env-file=.env scripts/generateDisclaimerAudio.mjs   (re-records the spoken disclaimer)');
