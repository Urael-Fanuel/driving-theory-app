/**
 * Generates 3 Amharic number-announcement audio files and uploads to Supabase.
 *
 * Output files: number_1.mp3 (አንድ), number_2.mp3 (ሁለት), number_3.mp3 (ሦስት)
 *
 * Run once:
 *   npx tsx backend/generateNumberAudio.ts
 */

import * as fs    from 'fs';
import * as path  from 'path';
import * as https from 'https';
import { createClient } from '@supabase/supabase-js';

// ─── Load .env ────────────────────────────────────────────────────────────────
(function loadDotEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim(), v = t.slice(eq + 1).trim();
    if (k && !(k in process.env)) process.env[k] = v;
  }
})();

const API_KEY          = process.env.EXPO_PUBLIC_GOOGLE_TTS_KEY ?? '';
const SUPABASE_URL     = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_SVC_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const AUDIO_DIR        = path.join(process.cwd(), 'assets', 'audio');

// ─── 3 number files to generate ───────────────────────────────────────────────
const NUMBER_FILES = [
  { filename: 'number_1.mp3', text: 'አንድ' },
  { filename: 'number_2.mp3', text: 'ሁለት' },
  { filename: 'number_3.mp3', text: 'ሦስት' },
];

// ─── Google TTS (same settings as generateAllAudio.ts) ───────────────────────
function callTTS(text: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      input: { text },
      voice: { languageCode: 'am-ET', name: 'am-ET-Standard-A', ssmlGender: 'FEMALE' },
      audioConfig: { audioEncoding: 'MP3', speakingRate: 0.9, pitch: 0.0,
                     effectsProfileId: ['handset-class-device'] },
    });
    const req = https.request({
      hostname: 'texttospeech.googleapis.com',
      path:     `/v1/text:synthesize?key=${API_KEY}`,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const data = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
        if (data.error) reject(new Error(data.error.message));
        else resolve(Buffer.from(data.audioContent, 'base64'));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🔢 Generating number announcement audio files...\n');

  const client = createClient(SUPABASE_URL, SUPABASE_SVC_KEY);

  for (const { filename, text } of NUMBER_FILES) {
    const localPath = path.join(AUDIO_DIR, filename);

    // 1. Generate audio
    if (fs.existsSync(localPath)) {
      console.log(`  ⏭  ${filename} already exists locally`);
    } else {
      console.log(`  🎙  Generating ${filename} ("${text}")...`);
      const buffer = await callTTS(text);
      fs.writeFileSync(localPath, buffer);
      console.log(`  ✅ Saved ${filename}`);
    }

    // 2. Upload to Supabase Storage
    console.log(`  📤 Uploading ${filename} to Supabase...`);
    const fileBuffer = fs.readFileSync(localPath);
    const { error } = await client.storage
      .from('audio')
      .upload(filename, fileBuffer, { contentType: 'audio/mpeg', upsert: true });

    if (error) {
      console.error(`  ❌ Upload failed: ${error.message}`);
    } else {
      const url = `${SUPABASE_URL}/storage/v1/object/public/audio/${filename}`;
      console.log(`  ✅ Uploaded → ${url}`);
    }
    console.log();
  }

  console.log('🎉 Done! Add these constants to your app:');
  console.log(`   number_1: ${SUPABASE_URL}/storage/v1/object/public/audio/number_1.mp3`);
  console.log(`   number_2: ${SUPABASE_URL}/storage/v1/object/public/audio/number_2.mp3`);
  console.log(`   number_3: ${SUPABASE_URL}/storage/v1/object/public/audio/number_3.mp3`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
