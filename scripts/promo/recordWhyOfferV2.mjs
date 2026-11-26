/**
 * scripts/promo/recordWhyOfferV2.mjs
 * Records the Engine A voice of the "why?" offer, version 2: the OWNER'S own wording (message + button) from
 * planning/v13/why_offer_v2_owner.json. The voice keeps his spelling of "three" (with an extra letter, so the voice says it well);
 * the text shown on screen (constants/strings.ts) uses the normal spelling.
 * Same voice and settings as scripts/generateEngineAVoices.mjs. New file name (_v2), because phones cache audio by file name.
 * Output: docs/voice/why_offer_v2.mp3 (not deployed here). Usage: node --env-file=.env scripts/promo/recordWhyOfferV2.mjs
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const KEY = process.env.EXPO_PUBLIC_GOOGLE_TTS_KEY;
if (!KEY) { console.error('Missing EXPO_PUBLIC_GOOGLE_TTS_KEY'); process.exit(1); }
const own = JSON.parse(fs.readFileSync(path.join(ROOT, 'planning', 'v13', 'why_offer_v2_owner.json'), 'utf8'));
const parts = [own.why_limit_info, own.why_watch_button];
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ssml = `<speak><break time="150ms"/>${parts.map(esc).join('<break time="400ms"/>')}</speak>`;
const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${KEY}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ input: { ssml }, voice: { languageCode: 'am-ET', name: 'am-ET-Standard-A', ssmlGender: 'FEMALE' },
    audioConfig: { audioEncoding: 'MP3', speakingRate: 0.9, pitch: 0.0, effectsProfileId: ['handset-class-device'] } }),
});
if (!res.ok) { console.error('TTS ' + res.status); process.exit(1); }
const buf = Buffer.from((await res.json()).audioContent, 'base64');
const out = path.join(ROOT, 'docs', 'voice', 'why_offer_v2.mp3');
fs.writeFileSync(out, buf);
console.log('recorded', out, buf.length, 'bytes');
