/**
 * scripts/applySignName.mjs
 *
 * Applies the owner-approved official-wording NAME of one or more signs:
 *   1. writes the name into content/signs.json (name_amharic)
 *   2. generates a short name-only audio clip (Google TTS, same voice/settings as the
 *      explanation clips) into assets/audio/<audio_name_filename>
 *   3. replaces that clip in Supabase Storage (delete first = no stale CDN copy)
 *   4. updates ONLY name_amharic + audio_name_url on the DB row (never touches the
 *      explanation text or explanation audio)
 * A backup of the old values is written to planning/sign-names/backup_<num>.json first.
 *
 * Names come from planning/sign-names/approved_sign_names.json (never hand-typed).
 *
 * Run:
 *   node --env-file=.env scripts/applySignName.mjs --sign=101            (one sign)
 *   node --env-file=.env scripts/applySignName.mjs --from=102 --to=109   (a stage)
 *   node --env-file=.env scripts/applySignName.mjs --sign=101 --dry-run  (show only)
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import { createClient } from '@supabase/supabase-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SIGNS_PATH = join(ROOT, 'content', 'signs.json');
const NAMES_PATH = join(ROOT, 'planning', 'sign-names', 'approved_sign_names.json');
const AUDIO_DIR = join(ROOT, 'assets', 'audio');
const BUCKET = 'audio';

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const DRY = process.argv.includes('--dry-run');
const FROM = arg('from'), TO = arg('to');
const nums = FROM && TO
  ? Object.keys(JSON.parse(readFileSync(NAMES_PATH, 'utf8')).names).filter((n) => +n >= +FROM && +n <= +TO).sort()
  : (arg('sign') ?? '').split(',').filter(Boolean);
if (!nums.length) { console.error('❌ need --sign=<number>[,<number>] or --from=<N> --to=<N>'); process.exit(1); }

const { names } = JSON.parse(readFileSync(NAMES_PATH, 'utf8'));
const raw = readFileSync(SIGNS_PATH, 'utf8');
const bom = raw.charCodeAt(0) === 0xfeff;
const parsed = JSON.parse(bom ? raw.slice(1) : raw);
const isArr = Array.isArray(parsed);
const signs = isArr ? parsed : parsed.signs;

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabase = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const TTS_KEY = process.env.EXPO_PUBLIC_GOOGLE_TTS_KEY;

function callTTS(text) {
  return new Promise((resolve, reject) => {
    const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const body = JSON.stringify({
      input: { ssml: `<speak><break time="150ms"/>${escaped}</speak>` },
      voice: { languageCode: 'am-ET', name: 'am-ET-Standard-A', ssmlGender: 'FEMALE' },
      audioConfig: { audioEncoding: 'MP3', speakingRate: 0.9, pitch: 0.0, effectsProfileId: ['handset-class-device'] },
    });
    const req = https.request({ hostname: 'texttospeech.googleapis.com', path: `/v1/text:synthesize?key=${TTS_KEY}`, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          const d = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (d.error) reject(new Error(d.error.message));
          else if (!d.audioContent) reject(new Error('no audioContent'));
          else resolve(Buffer.from(d.audioContent, 'base64'));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject); req.write(body); req.end();
  });
}

let changed = false;
function flushSigns() {
  // signs.json can be briefly locked by Windows (Metro watcher / antivirus): retry
  for (let attempt = 1; ; attempt++) {
    try { writeFileSync(SIGNS_PATH, (bom ? '﻿' : '') + JSON.stringify(parsed, null, 2), 'utf8'); return; }
    catch (e) { if (attempt >= 60) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500); }
  }
}

for (const num of nums) {
  const sign = signs.find((s) => s.image_filename === `${num}.png`);
  const name = names[num];
  if (!sign || !name) { console.error(`❌ ${num}: sign or approved name not found`); process.exit(1); }
  console.log(`\n=== ${num} (${sign.id}) ===\nold name: ${sign.name_amharic}\nnew name: ${name}\nclip: ${sign.audio_name_filename}`);
  if (DRY) continue;

  const { data: dbRow } = await supabase.from('signs').select('id,name_amharic,audio_name_url').eq('id', sign.id).single();
  const backupPath = join(ROOT, 'planning', 'sign-names', `backup_${num}.json`);
  // never overwrite an existing backup: it holds the ORIGINAL values
  if (!existsSync(backupPath)) writeFileSync(backupPath,
    JSON.stringify({ at: new Date().toISOString(), signs_json: { name_amharic: sign.name_amharic, audio_name_filename: sign.audio_name_filename }, db: dbRow }, null, 1), 'utf8');

  const mp3 = await callTTS(name);
  writeFileSync(join(AUDIO_DIR, sign.audio_name_filename), mp3);
  console.log(`🎙️ generated ${mp3.length} bytes`);

  await supabase.storage.from(BUCKET).remove([sign.audio_name_filename]);
  const up = await supabase.storage.from(BUCKET).upload(sign.audio_name_filename, mp3, { contentType: 'audio/mpeg', cacheControl: '3600', upsert: false });
  if (up.error) { console.error('❌ upload failed:', up.error.message); process.exit(1); }
  const url = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${sign.audio_name_filename}?v=${Date.now()}`;

  const { error } = await supabase.from('signs').update({ name_amharic: name, audio_name_url: url }).eq('id', sign.id);
  if (error) { console.error('❌ DB update failed:', error.message); process.exit(1); }

  sign.name_amharic = name;
  changed = true;
  flushSigns();   // write right away so a crash never leaves signs.json behind the DB
  console.log('✅ done: signs.json + storage + DB (name_amharic, audio_name_url)');
}
