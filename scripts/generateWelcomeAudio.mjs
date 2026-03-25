/**
 * scripts/generateWelcomeAudio.mjs
 * Generates welcome_select_mode.mp3, explain_mode_a.mp3, explain_mode_b.mp3
 * using Google Cloud TTS (Amharic am-ET voice)
 */

import * as fs   from 'fs';
import * as path from 'path';
import * as https from 'https';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// Load .env
const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_TTS_KEY ?? '';
if (!API_KEY) { console.error('❌ Missing EXPO_PUBLIC_GOOGLE_TTS_KEY'); process.exit(1); }

const FILES = [
  {
    filename: 'welcome_select_mode.mp3',
    text: 'እንኳን ደህና መጡ! ሁለቱን የትምህርት ዘዴዎች ያዳምጡ።',
  },
  {
    filename: 'explain_mode_a.mp3',
    text: 'ይህ ክፍል ለሁሉም ሰው ክፍት ነው — ማንበብ አያስፈልግም። ሁሉም ጥያቄዎች፣ መልሶችና ማብራሪያዎች በድምጽ ይሰማሉ። አንዳንድ ትምህርቶች ቪዲዮም ይይዛሉ።',
  },
  {
    filename: 'explain_mode_b.mp3',
    text: 'ይህ ክፍል አማርኛ ማንበብ ለሚችሉ ሰዎች የተዘጋጀ ነው። ጥያቄዎች፣ መልሶችና ማብራሪያዎች በጽሑፍ ይታያሉ። ድምጽም ማዳመጥ ይችላሉ። አንዳንድ ትምህርቶች ቪዲዮም ይይዛሉ።',
  },
];

function ttsRequest(text) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      input: { text },
      voice: { languageCode: 'am-ET', name: 'am-ET-Standard-A' },
      audioConfig: { audioEncoding: 'MP3', speakingRate: 0.95, pitch: 0 },
    });

    const options = {
      hostname: 'texttospeech.googleapis.com',
      path:     `/v1/text:synthesize?key=${API_KEY}`,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.audioContent) resolve(parsed.audioContent);
          else reject(new Error(parsed.error?.message ?? 'No audioContent'));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

for (const { filename, text } of FILES) {
  const OUT = path.join(ROOT, 'assets', 'audio', filename);
  if (fs.existsSync(OUT)) {
    fs.unlinkSync(OUT);
    console.log(`🗑  Deleted old ${filename}`);
  }
  console.log(`🎙  Generating ${filename}...`);
  const audioB64 = await ttsRequest(text);
  fs.writeFileSync(OUT, Buffer.from(audioB64, 'base64'));
  console.log(`✅  Saved: ${filename}`);
}
