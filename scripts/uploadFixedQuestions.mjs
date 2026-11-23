/**
 * scripts/uploadFixedQuestions.mjs
 *
 * Targeted upload for the praise-word fix (see fixPraisePrefixLetter.cjs): for each question id given, uploads ONLY the
 * (new, versioned) audio file of its "correct" explanation and updates ONLY two fields of that question row in Supabase:
 * explanation_correct_amharic and explanation_correct_audio_url. Nothing else of the question, the sign or other questions
 * is touched. The new file name is new, so nothing is deleted from the cloud (the old file simply stops being referenced).
 *
 * Usage: node --env-file=.env scripts/uploadFixedQuestions.mjs 403_q3 418_q2 424_q2
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL_ = process.env.EXPO_PUBLIC_SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error('❌ Missing Supabase settings. Run with --env-file=.env'); process.exit(1); }
const sb = createClient(URL_, KEY);
const ids = process.argv.slice(2);
if (!ids.length) { console.error('give question ids'); process.exit(1); }

const raw = JSON.parse(readFileSync(join(ROOT, 'content', 'signs.json'), 'utf8').replace(/^﻿/, ''));
const signs = Array.isArray(raw) ? raw : raw.signs;
const stamp = Date.now();
let ok = 0;
for (const id of ids) {
  const q = signs.flatMap(s => s.questions || []).find(x => x.id === id);
  if (!q) { console.log(`❌ ${id}: not in signs.json`); continue; }
  const file = q.explanation_correct_audio;
  const local = join(ROOT, 'assets', 'audio', file);
  if (!existsSync(local)) { console.log(`❌ ${id}: local file missing ${file}`); continue; }
  const up = await sb.storage.from('audio').upload(file, readFileSync(local), { contentType: 'audio/mpeg', upsert: false });
  if (up.error && !/exists/i.test(up.error.message)) { console.log(`❌ ${id}: upload failed: ${up.error.message}`); continue; }
  const url = `${URL_}/storage/v1/object/public/audio/${file}?v=${stamp}`;
  const { error } = await sb.from('questions').update({ explanation_correct_amharic: q.explanation_correct_amharic, explanation_correct_audio_url: url }).eq('id', id);
  if (error) { console.log(`❌ ${id}: row update failed: ${error.message}`); continue; }
  const head = await fetch(url, { method: 'HEAD' });
  console.log(`${head.ok ? '✅' : '⚠️ '} ${id}: ${file} uploaded, row updated, file reachable: ${head.ok}`);
  if (head.ok) ok++;
}
console.log(`\n${ok} of ${ids.length} done.`);
