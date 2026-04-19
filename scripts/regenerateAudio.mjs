/**
 * regenerateAudio.mjs
 * Re-generates ONLY the audio (TTS → MP3 → Supabase)
 * for a given subtopic, using the EXISTING narration_script in the scaffold.
 * Does NOT call Gemini — keeps content intact.
 * Does NOT generate MP4 — behavioral subtopics use audio only.
 *
 * Usage:
 *   node --env-file=.env scripts/regenerateAudio.mjs --subtopic vk_l2_s3
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import { createClient } from '@supabase/supabase-js';

const __dirname     = dirname(fileURLToPath(import.meta.url));
const ROOT          = join(__dirname, '..');
const SCAFFOLD_PATH = join(ROOT, 'content', 'vehicle_knowledge_scaffold.json');
const TEMP_DIR      = join(ROOT, 'temp_behavioral');

if (!existsSync(TEMP_DIR)) mkdirSync(TEMP_DIR, { recursive: true });

const subtopicArg = process.argv.indexOf('--subtopic');
const SUBTOPIC_ID = subtopicArg >= 0 ? process.argv[subtopicArg + 1] : null;
if (!SUBTOPIC_ID) { console.error('❌ נדרש: --subtopic <id>'); process.exit(1); }

const TTS_KEY      = process.env.EXPO_PUBLIC_GOOGLE_TTS_KEY;
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!TTS_KEY || !SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ חסרים: EXPO_PUBLIC_GOOGLE_TTS_KEY / SUPABASE_URL / SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const scaffold = JSON.parse(readFileSync(SCAFFOLD_PATH, 'utf8'));

let foundSubtopic = null;
for (const level of scaffold.levels) {
  const sub = level.subtopics.find(s => s.id === SUBTOPIC_ID);
  if (sub) { foundSubtopic = sub; break; }
}
if (!foundSubtopic) { console.error(`❌ לא נמצא: ${SUBTOPIC_ID}`); process.exit(1); }

const narration = foundSubtopic.narration_script;
if (!narration) { console.error('❌ אין narration_script לנושא זה'); process.exit(1); }

console.log(`\n🎯 ${foundSubtopic.name_hebrew} (${SUBTOPIC_ID})`);
console.log(`📝 נרטיב: ${narration.substring(0, 80)}...`);

// ─── Helper ───────────────────────────────────────────────────────────────────
function httpsPost(hostname, path, body) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(JSON.stringify(body));
    const req = https.request({
      hostname, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': buf.byteLength },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

// ─── Step 0: Delete old audio from Supabase ──────────────────────────────────
if (foundSubtopic.narration_audio_url) {
  const oldMp3 = foundSubtopic.narration_audio_url.split('/audio/').pop()?.split('?')[0];
  if (oldMp3) {
    await supabase.storage.from('audio').remove([oldMp3]);
    console.log(`  🗑️  נמחק אודיו ישן: ${oldMp3}`);
  }
}

// ─── Step 1: Google TTS → MP3 ────────────────────────────────────────────────
console.log('\n⏳ שלב 1: Google TTS → MP3...');
const ttsRaw = await httpsPost('texttospeech.googleapis.com', `/v1/text:synthesize?key=${TTS_KEY}`, {
  input:       { text: narration },
  voice:       { languageCode: 'am-ET', name: 'am-ET-Standard-A', ssmlGender: 'FEMALE' },
  audioConfig: { audioEncoding: 'MP3', speakingRate: 0.85, pitch: 0.0,
                 effectsProfileId: ['handset-class-device'] },
});
const ttsData = JSON.parse(ttsRaw.toString('utf-8'));
if (ttsData.error) { console.error('❌ TTS error:', ttsData.error.message); process.exit(1); }
const mp3Buffer = Buffer.from(ttsData.audioContent, 'base64');
const mp3Path   = join(TEMP_DIR, `${SUBTOPIC_ID}_narration.mp3`);
writeFileSync(mp3Path, mp3Buffer);
console.log(`  ✅ MP3 (${(mp3Buffer.byteLength / 1024).toFixed(1)} KB)`);

// ─── Step 2: Upload to Supabase ──────────────────────────────────────────────
console.log('\n⏳ שלב 2: העלאה ל-Supabase...');
// Timestamp suffix → bypasses local audio cache on device
const ts          = Date.now();
const mp3Filename = `behavioral_${SUBTOPIC_ID}_narration_${ts}.mp3`;
const { error: uploadErr } = await supabase.storage
  .from('audio')
  .upload(mp3Filename, mp3Buffer, { contentType: 'audio/mpeg', upsert: false });
if (uploadErr) { console.error('❌ שגיאת העלאה:', uploadErr.message); process.exit(1); }
console.log(`  ✅ הועלה: ${mp3Filename}`);

const audioUrl = supabase.storage.from('audio').getPublicUrl(mp3Filename).data.publicUrl;

// ─── Step 3: Update scaffold JSON ────────────────────────────────────────────
foundSubtopic.narration_audio_url = audioUrl;
writeFileSync(SCAFFOLD_PATH, JSON.stringify(scaffold, null, 2), 'utf8');

console.log('\n✅ הושלם!');
console.log(`   🎙️  Audio: ${audioUrl}`);
