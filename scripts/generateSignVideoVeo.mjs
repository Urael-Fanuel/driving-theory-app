/**
 * generateSignVideoVeo.mjs
 *
 * Generates a realistic video for ONE sign using Veo (Google Vertex AI).
 * Downloads the result locally to temp_behavioral/ for review — does NOT
 * upload to Supabase or touch the DB. Run uploadSignVideo.mjs separately
 * after the user has reviewed and approved the clip.
 *
 * Usage:
 *   node --env-file=.env scripts/generateSignVideoVeo.mjs --sign-id SIGN_BUMP --model veo-3.0-generate-001 --prompt "..."
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import { GoogleAuth } from 'google-auth-library';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');
const TEMP_DIR  = join(ROOT, 'temp_behavioral');
if (!existsSync(TEMP_DIR)) mkdirSync(TEMP_DIR, { recursive: true });

const args = process.argv.slice(2);
const get  = (flag, def = null) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : def; };

const SIGN_ID = get('--sign-id');
const MODEL   = get('--model', 'veo-3.0-generate-001');
const PROMPT  = get('--prompt');
const DURATION = parseInt(get('--duration', '6'), 10);
const ASPECT  = get('--aspect', '16:9');

if (!SIGN_ID || !PROMPT) {
  console.error('❌ Usage: node generateSignVideoVeo.mjs --sign-id <id> --prompt "<text>" [--model veo-3.0-generate-001] [--duration 6] [--aspect 16:9]');
  process.exit(1);
}

const PROJECT_ID = process.env.VERTEX_PROJECT_ID;
const KEY_PATH    = process.env.VERTEX_KEY_PATH;
const REGION      = 'us-central1';

if (!PROJECT_ID || !KEY_PATH) {
  console.error('❌ Missing env: VERTEX_PROJECT_ID / VERTEX_KEY_PATH');
  process.exit(1);
}

async function getAccessToken() {
  const keyFilePath = join(ROOT, KEY_PATH.replace('./', ''));
  const auth = new GoogleAuth({ keyFile: keyFilePath, scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  return token;
}

function post(hostname, path, body, token) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(JSON.stringify(body));
    const req = https.request({
      hostname, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': buf.byteLength, Authorization: `Bearer ${token}` },
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf-8') }));
    });
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

console.log(`\n🎬 Veo video: sign "${SIGN_ID}" via ${MODEL}`);
console.log(`   Prompt: ${PROMPT}`);

const token = await getAccessToken();

const startPath = `/v1/projects/${PROJECT_ID}/locations/${REGION}/publishers/google/models/${MODEL}:predictLongRunning`;
const startBody = {
  instances: [{ prompt: PROMPT }],
  parameters: { durationSeconds: DURATION, aspectRatio: ASPECT, sampleCount: 1 },
};

console.log('\n⏳ שולח בקשה ל-Veo...');
const startRes = await post(`${REGION}-aiplatform.googleapis.com`, startPath, startBody, token);
if (startRes.status !== 200) {
  console.error('❌ שגיאה בהתחלת יצירה:', startRes.status, startRes.body.slice(0, 500));
  process.exit(1);
}
const { name: operationName } = JSON.parse(startRes.body);
console.log(`  ✅ עבודה נוצרה: ${operationName}`);

// ── Poll ────────────────────────────────────────────────────────────────────
const fetchPath = `/v1/projects/${PROJECT_ID}/locations/${REGION}/publishers/google/models/${MODEL}:fetchPredictOperation`;
console.log('\n⏳ ממתין לסיום (בדרך כלל 1-3 דקות)...');

let done = false;
let result = null;
for (let i = 0; i < 40 && !done; i++) {
  await sleep(10000);
  const pollRes = await post(`${REGION}-aiplatform.googleapis.com`, fetchPath, { operationName }, token);
  const parsed = JSON.parse(pollRes.body);
  if (parsed.done) {
    done = true;
    result = parsed;
  } else {
    process.stdout.write('.');
  }
}
console.log('');

if (!done) {
  console.error('❌ הזמן תם — העבודה עדיין רצה ברקע, נסה שוב בעוד כמה דקות עם אותו operationName:', operationName);
  process.exit(1);
}

if (result.error) {
  console.error('❌ שגיאת Veo:', JSON.stringify(result.error));
  process.exit(1);
}

const videoBase64 = result.response?.videos?.[0]?.bytesBase64Encoded
  ?? result.response?.predictions?.[0]?.bytesBase64Encoded;

if (!videoBase64) {
  console.error('❌ לא נמצא וידאו בתשובה:', JSON.stringify(result).slice(0, 500));
  process.exit(1);
}

const videoBuffer = Buffer.from(videoBase64, 'base64');
const outPath = join(TEMP_DIR, `${SIGN_ID}_veo.mp4`);
writeFileSync(outPath, videoBuffer);
console.log(`\n✅ סרטון נשמר מקומית: ${outPath} (${(videoBuffer.byteLength / 1024 / 1024).toFixed(1)} MB)`);
console.log('   בדוק אותו, ורק לאחר אישור הרץ uploadSignVideo.mjs להעלאה.');
