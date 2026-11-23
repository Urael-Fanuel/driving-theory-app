/**
 * scripts/auditAudioFiles.mjs
 *
 * READ-ONLY audit of the audio files in Supabase Storage (bucket "audio"). It never deletes, uploads or changes anything.
 *
 * It compares two lists:
 *   1. every audio file that really exists in the cloud (all folders), and
 *   2. every audio file name that something REFERENCES: the Supabase tables `questions` and `signs`, plus any "*.mp3"
 *      name written in the project's own content and source files (behavioral content, system sounds, number sounds ...).
 *
 *   MISSING = referenced but NOT in the cloud   -> dangerous: a learner would hear silence. Must be fixed before a release.
 *   ORPHAN  = in the cloud but referenced by nothing -> harmless to learners, only takes cloud space. Old files that were
 *             replaced by a versioned name (_v2 ...) end up here. They are deleted only on the owner's decision,
 *             and only after most learners have updated (a learner without internet still points at the old names).
 *
 * Usage: node --env-file=.env scripts/auditAudioFiles.mjs
 * Output: a summary on screen and the full lists in planning/audio-audit/audit_<date>.txt
 */
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL_ = process.env.EXPO_PUBLIC_SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) { console.error('❌ Missing Supabase settings. Run with --env-file=.env'); process.exit(1); }
const sb = createClient(URL_, KEY);
const BUCKET = 'audio';

// ─── 1. Everything that exists in the cloud ──────────────────────────────────────────────
async function listAll(prefix = '') {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb.storage.from(BUCKET).list(prefix, { limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error(`list "${prefix}": ${error.message}`);
    for (const it of data) {
      const full = prefix ? `${prefix}/${it.name}` : it.name;
      if (it.id === null) out.push(...await listAll(full));          // a folder
      else out.push({ path: full, size: it.metadata?.size ?? 0 });
    }
    if (data.length < 1000) break;
  }
  return out;
}
const cloud = await listAll();
const cloudSet = new Set(cloud.map(f => f.path));

// ─── 2a. What the tables reference ───────────────────────────────────────────────────────
const nameOf = u => { if (!u || typeof u !== 'string') return null; const m = u.match(/\/object\/public\/audio\/([^?]+)/); return m ? decodeURIComponent(m[1]) : null; };
async function allRows(table, cols) {
  let rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(cols).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows = rows.concat(data);
    if (data.length < 1000) break;
  }
  return rows;
}
const fromDb = new Map();   // name -> where it is referenced
const addDb = (name, where) => { if (name) fromDb.set(name, (fromDb.get(name) ? fromDb.get(name) + ', ' : '') + where); };
for (const q of await allRows('questions', '*')) {
  addDb(nameOf(q.question_audio_url), `question ${q.id}`);
  addDb(nameOf(q.explanation_correct_audio_url), `question ${q.id}`);
  addDb(nameOf(q.explanation_wrong_audio_url), `question ${q.id}`);
  const answers = typeof q.answers === 'string' ? JSON.parse(q.answers) : (q.answers || []);
  for (const a of answers) addDb(nameOf(a.audio_url), `question ${q.id}`);
}
for (const s of await allRows('signs', '*')) {
  addDb(nameOf(s.audio_name_url), `sign ${s.id}`);
  addDb(nameOf(s.audio_explanation_url), `sign ${s.id}`);
}

// ─── 2b. What the project's own files name (content, scripts, source) ────────────────────
const fromFiles = new Set();
function walk(dir, exts) {
  for (const n of readdirSync(dir)) {
    if (['node_modules', '.git', 'assets', 'android', 'ios', '.expo', 'temp_play_upload', 'temp_behavioral'].includes(n)) continue;
    const p = join(dir, n);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, exts);
    else if (exts.includes(extname(n)) && st.size < 20_000_000) {
      const text = readFileSync(p, 'utf8');
      for (const m of text.matchAll(/[\w\-./]+\.mp3/g)) fromFiles.add(m[0].split('/').pop());
    }
  }
}
for (const d of ['content', 'constants', 'services', 'components', 'app', 'hooks', 'backend']) { try { walk(join(ROOT, d), ['.json', '.ts', '.tsx', '.js']); } catch { /* folder may not exist */ } }

// ─── 3. Compare ──────────────────────────────────────────────────────────────────────────
const cloudBase = new Map(); for (const f of cloud) cloudBase.set(f.path.split('/').pop(), f.path);
const referenced = new Set([...fromDb.keys(), ...fromFiles]);
const missing = [...fromDb.keys()].filter(n => !cloudSet.has(n) && !cloudBase.has(n.split('/').pop())).sort();
// tts/ holds the recorded voices of texts (named by a code the app computes while it runs): nothing in the tables or files names them,
// so this audit CANNOT tell whether they are used. They are counted apart and never listed as orphans.
const ttsFiles = cloud.filter(f => f.path.startsWith('tts/'));
const orphans = cloud.filter(f => !f.path.startsWith('tts/') && !referenced.has(f.path) && !referenced.has(f.path.split('/').pop())).sort((a, b) => a.path.localeCompare(b.path));
const mb = b => (b / 1048576).toFixed(1);
const versioned = orphans.filter(f => /_v\d+\.mp3$/.test(f.path)).length;

const lines = [];
const P = s => { lines.push(s); console.log(s); };
P(`AUDIO AUDIT  ${new Date().toISOString().slice(0, 10)}   (read only: nothing was changed)`);
P(`Files in the cloud:                ${cloud.length}   (${mb(cloud.reduce((a, f) => a + f.size, 0))} MB)`);
P(`Referenced by the tables:          ${fromDb.size}`);
P(`Named in the project files:        ${fromFiles.size}`);
P('');
P(`MISSING (referenced, not in the cloud): ${missing.length}   <- must be 0 before a release`);
for (const n of missing.slice(0, 40)) P(`   ${n}   <- ${fromDb.get(n)}`);
if (missing.length > 40) P(`   ... and ${missing.length - 40} more (full list in the file)`);
P('');
P(`NOT CHECKABLE: ${ttsFiles.length} recorded-voice files in tts/ (${mb(ttsFiles.reduce((a, f) => a + f.size, 0))} MB), named by the app at run time. Never treat them as orphans.`);
P('');
P(`ORPHANS (in the cloud, referenced by nothing): ${orphans.length}   (${mb(orphans.reduce((a, f) => a + f.size, 0))} MB)`);
P(`   of them ${versioned} carry a version suffix (_vN) and ${orphans.length - versioned} do not`);
const byPrefix = {};
for (const f of orphans) { const k = f.path.includes('/') ? f.path.split('/')[0] + '/' : f.path.replace(/[0-9]+.*$/, '').replace(/_?(q|s)$/, '') || '(other)'; byPrefix[k] = (byPrefix[k] || 0) + 1; }
for (const [k, v] of Object.entries(byPrefix).sort((a, b) => b[1] - a[1]).slice(0, 12)) P(`   ${String(v).padStart(5)}  ${k}`);
P('');
P('IMPORTANT: an orphan here means "nothing in the tables or in the project files names it". Do not delete anything from this list');
P('without the owner reading it first: a learner without internet may still point at an old name through the text built into his app version.');

const full = [...lines, '', '── FULL MISSING LIST ──', ...missing.map(n => `${n}   <- ${fromDb.get(n)}`), '', '── FULL ORPHAN LIST ──', ...orphans.map(f => `${f.path}   ${(f.size / 1024).toFixed(0)} KB`)];
mkdirSync(join(ROOT, 'planning', 'audio-audit'), { recursive: true });
const out = join(ROOT, 'planning', 'audio-audit', `audit_${new Date().toISOString().slice(0, 10)}.txt`);
writeFileSync(out, full.join('\n'), 'utf8');
console.log(`\nFull lists saved to ${out.replace(ROOT + '\\', '')}`);
