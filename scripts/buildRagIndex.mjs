/**
 * scripts/buildRagIndex.mjs
 *
 * Builds the RAG index for the "explain why" feature.
 *
 * Sources:
 *   1. Supabase `signs` table  — name_amharic + explanation_amharic (all sign topics)
 *   2. content/*_scaffold.json — behavioral subtopics (name + explanation + narration)
 *
 * For each item: creates one chunk, embeds it with gemini-embedding-001 (768 dims),
 * then DELETEs all rows in `rag_chunks` and inserts the fresh set.
 *
 * Run:
 *   node --env-file=.env scripts/buildRagIndex.mjs
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

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
const GEMINI_KEY   = process.env.GEMINI_API_KEY;

if (!SUPABASE_URL || !SERVICE_KEY || !GEMINI_KEY) {
  console.error('❌  Missing EXPO_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / GEMINI_API_KEY in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const SCAFFOLD_FILES = [
  'vehicle_knowledge_scaffold.json',
  'mind_safety_scaffold.json',
  'society_law_scaffold.json',
  'the_road_scaffold.json',
  'my_vehicle_scaffold.json',
  'two_wheelers_scaffold.json',
  'basics_license_scaffold.json',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Embedding ────────────────────────────────────────────────────────────────
async function embed(text, attempt = 1) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/gemini-embedding-001',
        content: { parts: [{ text }] },
        taskType: 'RETRIEVAL_DOCUMENT',
        outputDimensionality: 768,
      }),
    }
  );
  if (res.status === 429 && attempt <= 5) {
    const wait = attempt * 5000;
    console.log(`   ⏳ rate limit — waiting ${wait / 1000}s (attempt ${attempt})`);
    await sleep(wait);
    return embed(text, attempt + 1);
  }
  if (!res.ok) throw new Error(`embed failed ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.embedding.values;
}

// ─── Collect chunks ───────────────────────────────────────────────────────────
async function collectChunks() {
  const chunks = [];

  // 1. Signs from DB
  const { data: signs, error } = await supabase
    .from('signs')
    .select('id, topic_id, name_amharic, explanation_amharic')
    .order('topic_id')
    .limit(1000);
  if (error) throw new Error('fetch signs failed: ' + error.message);

  for (const s of signs) {
    const name = (s.name_amharic || '').trim();
    const expl = (s.explanation_amharic || '').trim();
    if (!expl) continue;
    chunks.push({
      id: `sign_${s.id}`,
      source_type: 'sign',
      source_id: s.id,
      title_amharic: name,
      content_amharic: name ? `${name}\n${expl}` : expl,
    });
  }
  console.log(`📋 signs chunks: ${chunks.length}`);

  // 2. Behavioral subtopics from scaffold JSONs
  let behavioralCount = 0;
  for (const file of SCAFFOLD_FILES) {
    const path = join(ROOT, 'content', file);
    if (!existsSync(path)) continue;
    const data = JSON.parse(readFileSync(path, 'utf8'));
    for (const level of data.levels ?? []) {
      for (const sub of level.subtopics ?? []) {
        const name = (sub.name_amharic || '').trim();
        const expl = (sub.explanation_amharic || '').trim();
        const narr = (sub.narration_script || '').trim();
        if (!expl && !narr) continue; // skip empty scaffolds
        const body = [name, expl, narr].filter(Boolean).join('\n');
        chunks.push({
          id: `behavioral_${sub.id}`,
          source_type: 'behavioral',
          source_id: sub.id,
          title_amharic: name,
          content_amharic: body,
        });
        behavioralCount++;
      }
    }
  }
  console.log(`📋 behavioral chunks: ${behavioralCount}`);

  return chunks;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
console.log('\n🧠  buildRagIndex.mjs');
console.log('═'.repeat(55));

const chunks = await collectChunks();
console.log(`📦 total chunks to embed: ${chunks.length}\n`);

// Embed all chunks
let done = 0;
for (const chunk of chunks) {
  chunk.embedding = await embed(chunk.content_amharic);
  done++;
  if (done % 25 === 0 || done === chunks.length) {
    console.log(`   🔢 embedded ${done}/${chunks.length}`);
  }
  await sleep(120); // gentle rate limiting
}

// DELETE all existing rows, then insert fresh (per project rule: delete before upload)
console.log('\n🗑️  deleting old rag_chunks rows...');
const { error: delErr } = await supabase.from('rag_chunks').delete().neq('id', '');
if (delErr) throw new Error('delete failed: ' + delErr.message);

console.log('⬆️  inserting new rows...');
const BATCH = 50;
for (let i = 0; i < chunks.length; i += BATCH) {
  const batch = chunks.slice(i, i + BATCH);
  const { error: insErr } = await supabase.from('rag_chunks').insert(batch);
  if (insErr) throw new Error(`insert batch ${i / BATCH} failed: ` + insErr.message);
  console.log(`   ✅ inserted ${Math.min(i + BATCH, chunks.length)}/${chunks.length}`);
}

// Verify
const { count } = await supabase.from('rag_chunks').select('*', { count: 'exact', head: true });
console.log(`\n🎉 done — rag_chunks now has ${count} rows`);
