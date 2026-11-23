/**
 * scripts/fixPraisePrefixLetter.cjs
 * Fixes the wrong-letter praise word (U+130D U+1268 U+12DD, should be U+130E U+1268 U+12DD) in the
 * "explanation_correct_amharic" of the questions given on the command line, gives the audio of that
 * explanation a new versioned name (_v2) so phones do not keep playing the old cached file, and removes
 * the old local file. LOCAL ONLY: nothing is uploaded here (uploadNewAudio.mjs does that after the owner listened).
 * Usage: node scripts/fixPraisePrefixLetter.cjs 403_q3 418_q2 424_q2
 */
const fs = require('fs');
const BAD = 'ግቨዝ', GOOD = 'ጎቨዝ';
const ids = process.argv.slice(2);
if (!ids.length) { console.error('give question ids'); process.exit(1); }
const P = 'content/signs.json';
const raw = JSON.parse(fs.readFileSync(P, 'utf8'));
const arr = Array.isArray(raw) ? raw : raw.signs;
for (const id of ids) {
  const sign = arr.find(s => (s.questions || []).some(q => q.id === id));
  if (!sign) throw new Error('question not found: ' + id);
  const q = sign.questions.find(x => x.id === id);
  if (!q.explanation_correct_amharic.includes(BAD)) { console.log(id, 'no wrong letter, skipped'); continue; }
  q.explanation_correct_amharic = q.explanation_correct_amharic.split(BAD).join(GOOD);
  const old = q.explanation_correct_audio;
  const nw = /_v\d+\.mp3$/.test(old) ? old.replace(/_v(\d+)\.mp3$/, (m, n) => `_v${+n + 1}.mp3`) : old.replace(/\.mp3$/, '_v2.mp3');
  q.explanation_correct_audio = nw;
  if (fs.existsSync('assets/audio/' + old)) fs.unlinkSync('assets/audio/' + old);
  console.log(id, sign.id, old, '->', nw);
}
fs.writeFileSync(P, JSON.stringify(raw, null, 2), 'utf8');
