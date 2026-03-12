/**
 * Generates number_4.mp3 ("አራት" in Amharic) using Google TTS
 * and uploads it to Supabase Storage.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// Load .env
const envPath = path.join(ROOT, '.env');
for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx < 1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const val = trimmed.slice(eqIdx + 1).trim();
  if (key && !(key in process.env)) process.env[key] = val;
}

const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_TTS_KEY;
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OUTPUT = path.join(ROOT, 'assets', 'audio', 'number_4.mp3');

async function googleTTS(text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      input: { text },
      voice: { languageCode: 'am-ET', ssmlGender: 'FEMALE' },
      audioConfig: { audioEncoding: 'MP3', speakingRate: 0.9 },
    });
    const options = {
      hostname: 'texttospeech.googleapis.com',
      path: `/v1/text:synthesize?key=${GOOGLE_KEY}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (!json.audioContent) return reject(new Error(data));
          resolve(Buffer.from(json.audioContent, 'base64'));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

console.log('🎵 Generating number_4.mp3 ("አራት")...');
const audio = await googleTTS('አራት');
fs.writeFileSync(OUTPUT, audio);
console.log(`✅ Saved: ${OUTPUT}`);

// Upload to Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const { error } = await supabase.storage
  .from('audio')
  .upload('number_4.mp3', audio, { contentType: 'audio/mpeg', upsert: true });

if (error) {
  console.error('❌ Upload failed:', error.message);
} else {
  console.log('✅ Uploaded to Supabase Storage: number_4.mp3');
}
