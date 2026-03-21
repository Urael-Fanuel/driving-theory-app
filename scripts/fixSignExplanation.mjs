/**
 * fixSignExplanation.mjs
 * Fixes ONLY name_amharic + explanation_amharic for a sign — does NOT touch questions.
 *
 * Usage:
 *   node --env-file=.env scripts/fixSignExplanation.mjs --sign-number 424
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ─── CLI args ──────────────────────────────────────────────────────────────────
const signNumArg = process.argv.find((a, i) => process.argv[i - 1] === '--sign-number');
if (!signNumArg) {
  console.error('Usage: node fixSignExplanation.mjs --sign-number 424');
  process.exit(1);
}
const SIGN_NUMBER = signNumArg;

// ─── Clients ───────────────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-2.5-flash';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

// ─── Find sign image ───────────────────────────────────────────────────────────
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

// ─── Gemini: generate name + explanation only ──────────────────────────────────
async function generateExplanation(signImagePath, sign) {
  const imageBuffer = readFileSync(signImagePath);
  const base64 = imageBuffer.toString('base64');
  const mimeType = signImagePath.toLowerCase().endsWith('.jpg') || signImagePath.toLowerCase().endsWith('.jpeg')
    ? 'image/jpeg' : 'image/png';

  const prompt = `אתה מומחה לתמרורי ישראל ולשפת אמהרית (געז).

מצורפת תמונה של תמרור ישראלי.

━━━ זהות התמרור (מאומת מראש) ━━━
שם עברי: "${sign.name_hebrew}"

המשימה: צור שם קצר והסבר ברור לתמרור זה באמהרית.

כללים:
- name_amharic: שם קצר (3-6 מילים) שמתרגם את השם העברי
- explanation_amharic: הסבר ברור (2-3 משפטים) מה התמרור מצווה ומה על הנהג לעשות בהתאם לו
- כתוב בשפת אמהרית (תסריט געז)
- התבסס על המשמעות הרשמית של התמרור לפי שמו העברי

החזר ONLY JSON ללא שום טקסט נוסף:
{
  "name_amharic": "...",
  "explanation_amharic": "..."
}`;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [
        { inline_data: { mime_type: mimeType, data: base64 } },
        { text: prompt },
      ]}],
      generationConfig: { temperature: 0.2, maxOutputTokens: 2048 },
    }),
  });
  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  const textPart = parts.find(p => p.text) || parts[0];
  const text = textPart?.text?.trim() || '';
  const jsonStr = text
    .replace(/^```json\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/\r?\n/g, ' ')  // collapse newlines that break JSON strings
    .trim();
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error('Raw Gemini response:', text.substring(0, 500));
    throw e;
  }
}

// ─── Delete old name/explanation audio ────────────────────────────────────────
function deleteOldExplanationAudio(signNumber) {
  const audioDir = join(ROOT, 'assets', 'audio');
  const files = readdirSync(audioDir);
  const toDelete = files.filter(f =>
    f === `${signNumber}_name.mp3` ||
    f === `${signNumber}_explanation.mp3`
  );
  toDelete.forEach(f => {
    unlinkSync(join(audioDir, f));
    console.log(`  🗑️  Deleted: ${f}`);
  });
  return toDelete.length;
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🔄 fixSignExplanation.mjs — Sign ${SIGN_NUMBER}`);
  console.log('═'.repeat(50));

  // Load signs
  const signsPath = join(ROOT, 'content', 'signs.json');
  const signs = JSON.parse(readFileSync(signsPath, 'utf8'));
  const sign = signs.find(s => s.image_filename === `${SIGN_NUMBER}.png`);
  if (!sign) { console.error(`❌ Sign ${SIGN_NUMBER} not found in signs.json`); process.exit(1); }
  console.log(`✅ Sign: ${sign.id} (${sign.name_hebrew})`);
  console.log(`📝 Current name_amharic: ${sign.name_amharic}`);
  console.log(`📝 Current explanation_amharic: ${sign.explanation_amharic?.substring(0, 80)}...`);

  // Find image
  const imgPath = findOurImagePath(sign);
  if (!imgPath) { console.error('❌ Sign image not found'); process.exit(1); }
  console.log(`🖼️  Image: ${imgPath.split('\\').slice(-2).join('\\')}`);

  // Generate via Gemini
  console.log('\n🤖 Generating name + explanation via Gemini...');
  const result = await generateExplanation(imgPath, sign);
  console.log(`✅ name_amharic: ${result.name_amharic}`);
  console.log(`✅ explanation_amharic: ${result.explanation_amharic}`);

  // Delete old audio
  console.log('\n🗑️  Deleting old name/explanation audio...');
  const deleted = deleteOldExplanationAudio(SIGN_NUMBER);
  console.log(`   Deleted ${deleted} files`);

  // Update signs.json (only name + explanation — questions untouched)
  sign.name_amharic = result.name_amharic;
  sign.explanation_amharic = result.explanation_amharic;
  writeFileSync(signsPath, JSON.stringify(signs, null, 2));
  console.log(`✅ signs.json updated (questions unchanged)`);

  // Update Supabase signs table only (not questions)
  console.log(`\n📤 Updating Supabase signs table...`);
  const { error } = await supabase
    .from('signs')
    .update({
      name_amharic: result.name_amharic,
      explanation_amharic: result.explanation_amharic,
    })
    .eq('id', sign.id);
  if (error) throw new Error('Supabase update failed: ' + error.message);
  console.log(`✅ Supabase signs table updated`);

  console.log('\n' + '═'.repeat(50));
  console.log('✅ Done! Next steps:');
  console.log('   1. npx tsx scripts/generateAllAudio.ts');
  console.log(`   2. node --env-file=.env scripts/uploadNewAudio.mjs --from=${SIGN_NUMBER} --to=${SIGN_NUMBER}`);
  console.log('      (uploadNewAudio will re-upload the new name/explanation audio)');
}

main().catch(e => { console.error('❌ Fatal:', e.message); process.exit(1); });
