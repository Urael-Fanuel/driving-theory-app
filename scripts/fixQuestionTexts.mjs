/**
 * scripts/fixQuestionTexts.mjs
 *
 * Problem: Questions for numbered signs (104–153) say "ምልክት 104 ሲያዩ ምን ማድረግ አለብዎ?"
 * (When you see sign 104, what should you do?) — users don't remember sign numbers!
 *
 * Fix: Replace "ምልክት NNN" with the sign's Amharic name.
 * "ምልክት 104 ሲያዩ ምን ማድረግ አለብዎ?" → "ድርብ ጠምዘዝ ሲያዩ ምን ማድረግ አለብዎ?"
 * "ምልክት 104 ምን ዓይነት አደጋ ያሳያል?" → "ድርብ ጠምዘዝ ምን ዓይነት አደጋ ያሳያል?"
 *
 * After this script, run:
 *   npx tsx scripts/generateAllAudio.ts         (regenerates changed question audio)
 *   node --env-file=.env scripts/uploadNewAudio.mjs  (uploads to Supabase)
 *
 * Run:
 *   node scripts/fixQuestionTexts.mjs
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT       = join(__dirname, '..');
const SIGNS_PATH = join(ROOT, 'content', 'signs.json');
const AUDIO_DIR  = join(ROOT, 'assets', 'audio');

// ─── Load signs.json ──────────────────────────────────────────────────────────
const raw      = readFileSync(SIGNS_PATH, 'utf8');
const stripped = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
const allSigns = JSON.parse(stripped);
const signsArr = Array.isArray(allSigns) ? allSigns : allSigns.signs ?? Object.values(allSigns);

// ─── Filter: signs with numeric image filenames (e.g. "104.png") ──────────────
const numberedSigns = signsArr.filter(s => s.image_filename && /^\d+\.png$/.test(s.image_filename));

console.log(`\n✏️   fixQuestionTexts.mjs`);
console.log(`${'═'.repeat(55)}`);
console.log(`Numbered signs to update: ${numberedSigns.length}\n`);

let updatedQuestions = 0;
let deletedAudio     = 0;
const audioToDelete  = new Set();

// ─── Update question texts ────────────────────────────────────────────────────
for (const sign of numberedSigns) {
  const signNum    = parseInt(sign.image_filename, 10); // e.g. 104
  const signName   = sign.name_amharic;                 // e.g. "ድርብ ጠምዘዝ"
  const searchTerm = `ምልክት ${signNum}`;                 // e.g. "ምልክት 104"

  for (const q of sign.questions) {
    const original = q.question_amharic;
    if (original.includes(searchTerm)) {
      q.question_amharic = original.replace(new RegExp(searchTerm, 'g'), signName);
      updatedQuestions++;
      // Mark question audio for deletion (so it gets regenerated)
      if (q.question_audio) audioToDelete.add(q.question_audio);
    }
  }
}

console.log(`✅  Questions updated: ${updatedQuestions}`);

// ─── Write updated signs.json ─────────────────────────────────────────────────
writeFileSync(SIGNS_PATH, JSON.stringify(allSigns, null, 2), 'utf8');
console.log(`✅  signs.json saved\n`);

// ─── Delete stale question audio files (so generateAllAudio.ts regenerates them) ─
console.log(`🗑️   Deleting ${audioToDelete.size} stale question audio files...\n`);

for (const filename of audioToDelete) {
  const localPath = join(AUDIO_DIR, filename);
  if (existsSync(localPath)) {
    unlinkSync(localPath);
    deletedAudio++;
  }
}

console.log(`✅  Deleted ${deletedAudio} files (${audioToDelete.size - deletedAudio} were already missing)\n`);

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(`${'═'.repeat(55)}`);
console.log(`🎉  Done! Updated ${updatedQuestions} questions in ${numberedSigns.length} signs.`);
console.log(`\nEXAMPLE (SIGN_104):`);
const sign104 = numberedSigns.find(s => s.image_filename === '104.png');
if (sign104) {
  sign104.questions.forEach((q, i) => {
    console.log(`  Q${i+1}: ${q.question_amharic}`);
  });
}
console.log(`\n${'─'.repeat(55)}`);
console.log(`\nNext steps:`);
console.log(`  1. npx tsx scripts/generateAllAudio.ts`);
console.log(`  2. node --env-file=.env scripts/uploadNewAudio.mjs`);
console.log(`${'═'.repeat(55)}\n`);
