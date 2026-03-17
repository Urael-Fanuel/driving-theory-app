/**
 * generateQuestionsFromExplanation.mjs
 *
 * Generates 3 questions × 4 answers for each sign,
 * based on the sign's EXISTING explanation_amharic (already written by Gemini).
 * Does NOT change name_amharic or explanation_amharic.
 *
 * Usage:
 *   node --env-file=.env scripts/generateQuestionsFromExplanation.mjs --sign-number 301 --limit 10
 *
 * Requires: GEMINI_API_KEY in .env
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT        = join(__dirname, '..');
const SIGNS_PATH  = join(ROOT, 'content', 'signs.json');
const BACKUP_PATH = join(ROOT, 'content', 'signs.json.backup');
const AUDIO_DIR   = join(ROOT, 'assets', 'audio');

const DRY_RUN = process.argv.includes('--dry-run');

const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit=') || a === '--limit');
const LIMIT = LIMIT_ARG
  ? parseInt(LIMIT_ARG.includes('=') ? LIMIT_ARG.split('=')[1] : process.argv[process.argv.indexOf('--limit') + 1], 10)
  : Infinity;

const SIGN_NUMBER_ARG = process.argv.find(a => a.startsWith('--sign-number=') || a === '--sign-number');
const SIGN_NUMBER = SIGN_NUMBER_ARG
  ? parseInt(SIGN_NUMBER_ARG.includes('=') ? SIGN_NUMBER_ARG.split('=')[1] : process.argv[process.argv.indexOf('--sign-number') + 1], 10)
  : null;

const OFFSET_ARG = process.argv.find(a => a.startsWith('--offset=') || a === '--offset');
const OFFSET = OFFSET_ARG
  ? parseInt(OFFSET_ARG.includes('=') ? OFFSET_ARG.split('=')[1] : process.argv[process.argv.indexOf('--offset') + 1], 10)
  : 0;

const API_KEY = process.env.GEMINI_API_KEY;
const MODEL   = 'gemini-2.5-flash';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

const DELAY_MS       = 10000;
const RETRY_DELAY_MS = 30000;
const MAX_RETRIES    = 3;

// ─── Prompt ───────────────────────────────────────────────────────────────────

const SYSTEM_INSTRUCTION = `\
You are an expert driving instructor creating exam questions for Ethiopian immigrants learning Israeli traffic laws.
Your audience has limited reading ability — write in clear, simple Amharic.

Rules:
- Create exactly 3 questions based ONLY on the explanation provided.
- Each question must have exactly 4 answers (A, B, C, D) — exactly 1 correct.
- Each answer must be a FULL SENTENCE — minimum 5 words. No short 2-3 word answers.
- Questions must test practical understanding: what the driver must DO, when, and why.
- Correct answer must be clearly correct per Israeli traffic law.
- Wrong answers must be plausible but clearly incorrect.
- explanation_correct_amharic: why the correct answer is right (1 sentence).
- explanation_wrong_amharic: what the driver risks by choosing wrong (1 sentence).
- Write in correct Amharic (fidel) spelling.
- Return valid JSON only — no markdown, no extra text, no code fences.`;

function buildPrompt(sign) {
  return `Israeli traffic sign: ${sign.name_hebrew || sign.id}

Here is the detailed Amharic explanation of this sign (already approved content):
"${sign.explanation_amharic}"

Based ONLY on this explanation, create exactly 3 exam questions in Amharic.
Each question must have 4 answer choices (A, B, C, D) — exactly 1 correct.

Return JSON with this exact structure:
{
  "questions": [
    {
      "question_amharic": "question in Amharic?",
      "explanation_correct_amharic": "why the correct answer is right",
      "explanation_wrong_amharic": "what the driver risks by choosing wrong",
      "answers": [
        { "id": "A", "text_amharic": "full sentence — minimum 5 words", "is_correct": false },
        { "id": "B", "text_amharic": "full sentence — minimum 5 words", "is_correct": true },
        { "id": "C", "text_amharic": "full sentence — minimum 5 words", "is_correct": false },
        { "id": "D", "text_amharic": "full sentence — minimum 5 words", "is_correct": false }
      ]
    },
    { "question_amharic": "...", "explanation_correct_amharic": "...", "explanation_wrong_amharic": "...", "answers": [...] },
    { "question_amharic": "...", "explanation_correct_amharic": "...", "explanation_wrong_amharic": "...", "answers": [...] }
  ]
}`;
}

// ─── Gemini API call ──────────────────────────────────────────────────────────

async function callGemini(sign) {
  const body = {
    system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [{ role: 'user', parts: [{ text: buildPrompt(sign) }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.3 },
  };

  const res = await fetch(API_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const raw  = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON from Gemini: ${raw.slice(0, 200)}`);
  }

  if (!Array.isArray(parsed.questions) || parsed.questions.length !== 3) {
    throw new Error(`questions must be array of 3, got: ${parsed.questions?.length}`);
  }
  for (const q of parsed.questions) {
    if (!q.question_amharic || !Array.isArray(q.answers) || q.answers.length !== 4) {
      throw new Error(`Invalid question structure: ${JSON.stringify(q).slice(0, 100)}`);
    }
    const correctCount = q.answers.filter(a => a.is_correct).length;
    if (correctCount !== 1) {
      throw new Error(`Each question must have exactly 1 correct answer, got ${correctCount}`);
    }
  }

  return parsed;
}

async function callGeminiWithRetry(sign) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await callGemini(sign);
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      process.stdout.write(` ⚠️  retry ${attempt}/${MAX_RETRIES}...`);
      await sleep(RETRY_DELAY_MS);
    }
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Delete old question audio for a sign ────────────────────────────────────

function deleteOldQuestionAudio(sign) {
  let deleted = 0;
  for (const q of (sign.questions || [])) {
    for (const f of [q.question_audio, q.explanation_correct_audio, q.explanation_wrong_audio]) {
      if (f) {
        const p = join(AUDIO_DIR, f);
        if (existsSync(p)) { unlinkSync(p); deleted++; }
      }
    }
    for (const a of (q.answers || [])) {
      const answerFile = `answer_${q.id}_${a.id}.mp3`;
      const p = join(AUDIO_DIR, answerFile);
      if (existsSync(p)) { unlinkSync(p); deleted++; }
    }
  }
  return deleted;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!API_KEY) {
    console.error('❌  GEMINI_API_KEY is not set in .env');
    process.exit(1);
  }

  console.log(`\n🤖  generateQuestionsFromExplanation.mjs${DRY_RUN ? '  [DRY-RUN]' : ''}`);
  console.log('═'.repeat(60));

  const signsData = JSON.parse(readFileSync(SIGNS_PATH, 'utf-8'));
  const signs     = Array.isArray(signsData) ? signsData : Object.values(signsData);

  // Resolve start index
  let startIndex = OFFSET;
  if (SIGN_NUMBER !== null) {
    startIndex = signs.findIndex(s => s.image_filename === `${SIGN_NUMBER}.png`);
    if (startIndex === -1) {
      console.error(`❌  Sign number ${SIGN_NUMBER} not found (image_filename: "${SIGN_NUMBER}.png" missing)`);
      process.exit(1);
    }
    console.log(`🔍  --sign-number ${SIGN_NUMBER} → position ${startIndex + 1}`);
  }

  const end = LIMIT === Infinity ? signs.length : startIndex + LIMIT;
  const signsToProcess = signs.slice(startIndex, end);
  const first = signsToProcess[0];
  const last  = signsToProcess[signsToProcess.length - 1];
  console.log(`📋  Processing: ${signsToProcess.length} signs  (${first?.id} → ${last?.id})`);

  if (!DRY_RUN) {
    copyFileSync(SIGNS_PATH, BACKUP_PATH);
    console.log(`💾  Backup → content/signs.json.backup`);
  }

  console.log('');

  let ok = 0, failed = 0, totalAudioDeleted = 0;

  for (let i = 0; i < signsToProcess.length; i++) {
    const sign    = signsToProcess[i];
    const num     = String(i + 1).padStart(2, ' ');
    const signNum = sign.image_filename?.replace(/\.(png|jpg)$/i, '');

    if (!sign.explanation_amharic) {
      process.stdout.write(`  ${num}/${signsToProcess.length}  ${sign.id.padEnd(25)} ⚠️  No explanation_amharic — skipped\n`);
      continue;
    }

    process.stdout.write(`  ${num}/${signsToProcess.length}  ${sign.id.padEnd(25)} `);

    let result;
    try {
      result = await callGeminiWithRetry(sign);
    } catch (err) {
      process.stdout.write(`❌  FAILED: ${err.message.slice(0, 80)}\n`);
      failed++;
      await sleep(DELAY_MS);
      continue;
    }

    process.stdout.write(`✅\n`);
    ok++;

    if (!DRY_RUN) {
      // Delete old question audio files
      const deleted = deleteOldQuestionAudio(sign);
      totalAudioDeleted += deleted;

      // Save new questions with auto IDs and audio filenames
      sign.questions = result.questions.map((q, qi) => {
        const qKey = `${signNum}_q${qi + 1}`;
        return {
          id: qKey,
          question_amharic: q.question_amharic,
          question_audio: `${qKey}_question.mp3`,
          explanation_correct_amharic: q.explanation_correct_amharic,
          explanation_wrong_amharic: q.explanation_wrong_amharic,
          explanation_correct_audio: `${qKey}_correct.mp3`,
          explanation_wrong_audio: `${qKey}_wrong.mp3`,
          answers: q.answers.map(a => ({
            id: a.id,
            text_amharic: a.text_amharic,
            is_correct: a.is_correct,
            audio_filename: `answer_${qKey}_${a.id}.mp3`,
          })),
        };
      });

      // Incremental save after every sign
      writeFileSync(SIGNS_PATH, JSON.stringify(signs, null, 2), 'utf-8');
    }

    if (i < signsToProcess.length - 1) await sleep(DELAY_MS);
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`📊  Results:`);
  console.log(`   ✅  Generated : ${ok} signs`);
  console.log(`   ❌  Failed    : ${failed} signs`);
  if (!DRY_RUN) console.log(`   🗑️   Audio deleted: ${totalAudioDeleted} old files`);

  if (!DRY_RUN && ok > 0) {
    const toNum = SIGN_NUMBER !== null ? SIGN_NUMBER + (LIMIT === Infinity ? 0 : LIMIT - 1) : '?';
    console.log(`\n⏭️   Next steps:`);
    console.log(`   1. npx ts-node scripts/generateAllAudio.ts`);
    console.log(`   2. node --env-file=.env scripts/uploadNewAudio.mjs --from=${SIGN_NUMBER ?? 'X'} --to=${toNum}`);
  }

  console.log(`\n✅  Done! signs.json updated. Backup at: content/signs.json.backup`);
}

main().catch(err => {
  console.error('\n💥  Fatal error:', err.message);
  process.exit(1);
});
