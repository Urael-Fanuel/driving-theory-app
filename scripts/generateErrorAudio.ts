// @ts-nocheck
/**
 * scripts/generateErrorAudio.ts
 * Generates and uploads the two TTS-failure error audio files.
 *
 * tts_error_first.mp3  — played on first TTS failure (try again)
 * tts_error_retry.mp3  — played on second TTS failure (skip question)
 *
 * Both use formal/gender-neutral Amharic (ይ- prefix = respectful plural).
 *
 * Run: npx tsx scripts/generateErrorAudio.ts
 */

import * as fs    from 'fs';
import * as path  from 'path';
import * as https from 'https';
import { createClient } from '@supabase/supabase-js';

// ── Load .env ──────────────────────────────────────────────────────────────────
(function loadEnv() {
  const p = path.join(process.cwd(), '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (k && !(k in process.env)) process.env[k] = v;
  }
})();

const API_KEY          = process.env.EXPO_PUBLIC_GOOGLE_TTS_KEY ?? '';
const SUPABASE_URL     = process.env.EXPO_PUBLIC_SUPABASE_URL   ?? '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY  ?? '';
const OUTPUT_DIR       = path.join(process.cwd(), 'assets', 'audio');

if (!API_KEY)          { console.error('❌  Missing EXPO_PUBLIC_GOOGLE_TTS_KEY'); process.exit(1); }
if (!SUPABASE_URL)     { console.error('❌  Missing EXPO_PUBLIC_SUPABASE_URL');   process.exit(1); }
if (!SERVICE_ROLE_KEY) { console.error('❌  Missing SUPABASE_SERVICE_ROLE_KEY');  process.exit(1); }

// ── Audio files to generate ────────────────────────────────────────────────────
// Using formal/gender-neutral Amharic (ይ- prefix = respectful plural,
// addresses both masculine and feminine equally).
const FILES: Record<string, string> = {
  // First TTS failure: tell user there's a connection problem, invite retry
  'tts_error_first.mp3':
    'ከኢንተርኔት ጋር ችግር አለ። የፒሌይ ቁልፍን ይጫኑ ዳግም ለመሞከር።',

  // Second TTS failure on the same question: suggest moving on
  'tts_error_retry.mp3':
    'ዳግም ሞክረናል ግን አልተሳካም። ወደ ቀጣዩ ጥያቄ ይሂዱ ወይም ወደ ሌላ ርዕስ ይሂዱ፤ ኋላ ተመልሰው ይሞክሩ።',
};

// ── Google TTS REST call ───────────────────────────────────────────────────────
function callTTS(text: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      input:       { text },
      voice:       { languageCode: 'am-ET', name: 'am-ET-Standard-A', ssmlGender: 'FEMALE' },
      audioConfig: { audioEncoding: 'MP3', speakingRate: 0.85, pitch: 0.0,
                     effectsProfileId: ['handset-class-device'] },
    });

    const req = https.request(
      {
        hostname: 'texttospeech.googleapis.com',
        path:     `/v1/text:synthesize?key=${API_KEY}`,
        method:   'POST',
        headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          try {
            const json = JSON.parse(Buffer.concat(chunks).toString());
            if (!json.audioContent) {
              reject(new Error(`TTS API error: ${JSON.stringify(json)}`));
              return;
            }
            resolve(Buffer.from(json.audioContent, 'base64'));
          } catch (e) { reject(e); }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── Upload to Supabase ─────────────────────────────────────────────────────────
async function uploadToSupabase(
  client: ReturnType<typeof createClient>,
  filename: string,
  data: Buffer,
): Promise<string> {
  const { error } = await (client.storage as any)
    .from('audio')
    .upload(filename, data, { contentType: 'audio/mpeg', upsert: true });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  const { data: pub } = client.storage.from('audio').getPublicUrl(filename);
  return pub.publicUrl;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  for (const [filename, text] of Object.entries(FILES)) {
    console.log(`\n🎙️  Generating: ${filename}`);
    console.log(`   Text: ${text}`);

    // Generate audio
    const audioBuffer = await callTTS(text);

    // Save locally
    const localPath = path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(localPath, audioBuffer);
    console.log(`   ✅ Saved locally: ${localPath}`);

    // Upload to Supabase
    const publicUrl = await uploadToSupabase(client, filename, audioBuffer);
    console.log(`   ✅ Uploaded: ${publicUrl}`);
  }

  console.log('\n🎉 Done — both error audio files generated and uploaded.');
  console.log('   tts_error_first.mp3  → first TTS failure message');
  console.log('   tts_error_retry.mp3  → second TTS failure message');
}

main().catch((e) => { console.error('❌', e); process.exit(1); });
