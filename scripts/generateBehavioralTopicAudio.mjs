/**
 * generateBehavioralTopicAudio.mjs
 * Generates + uploads audio files for the 7 new behavioral topic names.
 * Files: topic_<id>_name.mp3 → Supabase Storage bucket "audio"
 */

import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import https from 'https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');
const AUDIO_DIR = join(ROOT, 'assets', 'audio');
const BUCKET    = 'audio';

// ─── Load env ─────────────────────────────────────────────────────────────────
if (!process.env.EXPO_PUBLIC_SUPABASE_URL) {
  const envPath = join(ROOT, '.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 1) continue;
      const k = trimmed.slice(0, eq).trim();
      const v = trimmed.slice(eq + 1).trim();
      if (k && !(k in process.env)) process.env[k] = v;
    }
  }
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_KEY      = process.env.EXPO_PUBLIC_GOOGLE_TTS_KEY;

if (!SUPABASE_URL || !SERVICE_KEY || !API_KEY) {
  console.error('❌ Missing env variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── Topics to generate ────────────────────────────────────────────────────────
const TOPICS = [
  { id: 'vehicle_knowledge', text: 'መኪናን ማወቅ' },
  { id: 'mind_safety',       text: 'አዕምሮ እና ደህንነት' },
  { id: 'society_law',       text: 'ማህበረሰብ እና ህግ' },
  { id: 'the_road',          text: 'የመንገድ ሁኔታዎች' },
  { id: 'my_vehicle',        text: 'ትክክለኛ አነዳድ' },
  { id: 'two_wheelers',      text: 'ሁለት ጎማ ተሽከርካሪዎች' },
  { id: 'basics_license',    text: 'መሠረቶች እና ፍቃድ' },
];

// ─── Google TTS ────────────────────────────────────────────────────────────────
function callTTS(text) {
  return new Promise((resolve, reject) => {
    const bodyObj = {
      input: { text },
      voice: { languageCode: 'am-ET', name: 'am-ET-Standard-A', ssmlGender: 'FEMALE' },
      audioConfig: { audioEncoding: 'MP3', speakingRate: 0.9, pitch: 0.0,
        effectsProfileId: ['handset-class-device'] },
    };
    const body = JSON.stringify(bodyObj);
    const req  = https.request({
      hostname: 'texttospeech.googleapis.com',
      path:     `/v1/text:synthesize?key=${API_KEY}`,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
          if (data.error) reject(new Error(data.error.message));
          else resolve(Buffer.from(data.audioContent, 'base64'));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Main ──────────────────────────────────────────────────────────────────────
for (const topic of TOPICS) {
  const filename = `topic_${topic.id}_name.mp3`;
  const filePath = join(AUDIO_DIR, filename);

  console.log(`\n⏳ ${topic.id} — "${topic.text}"`);

  // Generate audio
  const mp3Buffer = await callTTS(topic.text);
  writeFileSync(filePath, mp3Buffer);
  console.log(`  ✅ נוצר: ${filename}`);

  // Upload to Supabase
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filename, mp3Buffer, {
      contentType: 'audio/mpeg',
      upsert: true,
    });

  if (error) {
    console.error(`  ❌ שגיאה בהעלאה: ${error.message}`);
  } else {
    console.log(`  ✅ הועלה לסופאבייס`);
  }
}

console.log('\n✅ כל קבצי האודיו נוצרו והועלו בהצלחה!');
