/**
 * uploadRoadScene.mjs
 *
 * Publishes one road-scene: renders nothing itself, but takes a PNG built by
 * buildRoadScenarioDiagram.mjs plus a narration script, generates the Amharic
 * voice-over, uploads both to Supabase Storage, and prints the two URLs to
 * paste into the scaffold.
 *
 * Kept separate from regenerateAudio.mjs because that one reads the narration
 * out of a subtopic that already exists in a scaffold; a new scene has to be
 * published BEFORE it can be written into one.
 *
 * Usage:
 *   node --env-file=.env scripts/uploadRoadScene.mjs \
 *     --scene rd_l1_s1_sc2 --png <path> --narration <path to utf-8 text file>
 */

import { readFileSync } from 'fs';
import https from 'https';
import { createClient } from '@supabase/supabase-js';

const arg = name => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : null;
};

const SCENE     = arg('scene');
const PNG_PATH  = arg('png');
const NARR_PATH = arg('narration');
if (!SCENE || !PNG_PATH || !NARR_PATH) {
  console.error('Usage: --scene <id> --png <file> --narration <file>');
  process.exit(1);
}

const TTS_KEY      = process.env.EXPO_PUBLIC_GOOGLE_TTS_KEY;
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!TTS_KEY || !SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing EXPO_PUBLIC_GOOGLE_TTS_KEY / SUPABASE_URL / SERVICE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

function httpsPost(hostname, path, body) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(JSON.stringify(body));
    const req = https.request({
      hostname, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': buf.byteLength },
    }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

const narration = readFileSync(NARR_PATH, 'utf8').trim();
console.log(`Scene      : ${SCENE}`);
console.log(`Narration  : ${narration.length} characters`);

// ─── Narration → MP3 ──────────────────────────────────────────────────────────
// Same voice and rate as every other behavioural narration in the app, so one
// subtopic does not suddenly sound different from the next.
const ttsRaw = await httpsPost('texttospeech.googleapis.com', `/v1/text:synthesize?key=${TTS_KEY}`, {
  input:       { text: narration },
  voice:       { languageCode: 'am-ET', name: 'am-ET-Standard-A', ssmlGender: 'FEMALE' },
  audioConfig: { audioEncoding: 'MP3', speakingRate: 0.85, pitch: 0.0,
                 effectsProfileId: ['handset-class-device'] },
});
const ttsData = JSON.parse(ttsRaw.toString('utf-8'));
if (ttsData.error) { console.error('TTS error:', ttsData.error.message); process.exit(1); }
const mp3 = Buffer.from(ttsData.audioContent, 'base64');
console.log(`MP3        : ${(mp3.byteLength / 1024).toFixed(1)} KB`);

const ts = Date.now();

// ─── Upload both files ────────────────────────────────────────────────────────
// Timestamped names so a re-publish never collides with a cached copy on a
// learner's phone.
const mp3Name = `behavioral_${SCENE}_narration_${ts}.mp3`;
const { error: audioErr } = await supabase.storage
  .from('audio').upload(mp3Name, mp3, { contentType: 'audio/mpeg', upsert: false });
if (audioErr) { console.error('Audio upload failed:', audioErr.message); process.exit(1); }

const png     = readFileSync(PNG_PATH);
const pngName = `behavioral/behavioral_${SCENE}_diagram_${ts}.png`;
const { error: imgErr } = await supabase.storage
  .from('images').upload(pngName, png, { contentType: 'image/png', upsert: false });
if (imgErr) { console.error('Image upload failed:', imgErr.message); process.exit(1); }
console.log(`PNG        : ${(png.byteLength / 1024).toFixed(1)} KB`);

const audioUrl = supabase.storage.from('audio').getPublicUrl(mp3Name).data.publicUrl;
const imageUrl = supabase.storage.from('images').getPublicUrl(pngName).data.publicUrl;

console.log('\nnarration_audio_url:');
console.log(audioUrl);
console.log('image_url:');
console.log(imageUrl);
