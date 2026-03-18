/**
 * improveAmharicWithGemini.mjs
 *
 * Uses Gemini 2.0 Flash to rewrite name_amharic + explanation_amharic
 * for all 60 signs in content/signs.json.
 *
 * Usage:
 *   node --env-file=.env scripts/improveAmharicWithGemini.mjs                              # all signs
 *   node --env-file=.env scripts/improveAmharicWithGemini.mjs --sign-number 101 --limit 10 # signs 101-110
 *   node --env-file=.env scripts/improveAmharicWithGemini.mjs --sign-number 111 --limit 10 # signs 111-120
 *   node --env-file=.env scripts/improveAmharicWithGemini.mjs --dry-run                    # preview only
 *
 * Requires: GEMINI_API_KEY in .env
 */

import { readFileSync, writeFileSync, copyFileSync, unlinkSync, existsSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');
const SIGNS_PATH  = join(ROOT, 'content', 'signs.json');
const BACKUP_PATH = join(ROOT, 'content', 'signs.json.backup');
const AUDIO_DIR   = join(ROOT, 'assets', 'audio');

const DRY_RUN = process.argv.includes('--dry-run');

const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit=') || a === '--limit');
const LIMIT = LIMIT_ARG
  ? parseInt(LIMIT_ARG.includes('=') ? LIMIT_ARG.split('=')[1] : process.argv[process.argv.indexOf('--limit') + 1], 10)
  : Infinity;

const OFFSET_ARG = process.argv.find(a => a.startsWith('--offset=') || a === '--offset');
const OFFSET = OFFSET_ARG
  ? parseInt(OFFSET_ARG.includes('=') ? OFFSET_ARG.split('=')[1] : process.argv[process.argv.indexOf('--offset') + 1], 10)
  : 0;

const SIGN_NUMBER_ARG = process.argv.find(a => a.startsWith('--sign-number=') || a === '--sign-number');
const SIGN_NUMBER = SIGN_NUMBER_ARG
  ? parseInt(SIGN_NUMBER_ARG.includes('=') ? SIGN_NUMBER_ARG.split('=')[1] : process.argv[process.argv.indexOf('--sign-number') + 1], 10)
  : null;
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL   = 'gemini-2.5-flash';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

const DELAY_MS       = 10000; // 10s between calls → ~6 req/min, well under free tier limit
const RETRY_DELAY_MS = 30000; // 30s wait on error (handles 429 quota reset)
const MAX_RETRIES    = 3;

// ─── Gemini prompt ────────────────────────────────────────────────────────────

const SYSTEM_INSTRUCTION = `\
You are an expert driving instructor and Amharic content writer specializing in Israeli traffic signs. \
Your audience is Ethiopian immigrants in Israel who are learning to drive — many have limited reading ability.

Your goal is EDUCATION — write content that truly teaches. \
Model your output on this high-quality example for a warning sign:
  name_amharic: "ከፊትህ ባለው መንገድ ላይ የጎደጎደ ወይም የተበላሸ መንገድ መኖሩን ያመለክታል።"
  explanation_amharic: "ይህ ምልክት በመንገዱ ላይ ጉድጓዶች፣ እብጠቶች ወይም መጥፎ ጥርጊያ መኖሩን ያስጠነቅቀናል። አሽከርካሪው ይህንን ምልክት ሲያይ ፍጥነቱን መቀነስ እና ጥንቃቄ ማድረግ አለበት።"

Strict rules — follow all without exception:

1. name_amharic: A full descriptive sentence (up to 15 words) explaining what the sign indicates.
   Do NOT write just 2–3 words. Describe what the sign means on the road.

2. explanation_amharic: 2–3 sentences covering ALL of:
   a. What this sign means and its purpose
   b. Exactly what the driver MUST DO — specific actions
   c. Consequence of ignoring it (danger, fine, accident)

3. questions: Exactly 3 questions that test understanding of THIS specific sign.
   Each question must have exactly 4 answers (A, B, C, D) — exactly 1 correct.
   Rules for questions:
   - Questions must be directly about what this sign means and what the driver must do
   - Each answer must be a FULL SENTENCE (not 2-3 words) — minimum 5 words
   - Correct answer must be clearly correct per Israeli traffic law
   - Wrong answers must be plausible but clearly wrong
   - explanation_correct_amharic: why the correct answer is right (1 sentence)
   - explanation_wrong_amharic: what the driver risks by choosing wrong (1 sentence)

4. Write in clear, simple Amharic that any ordinary adult can understand — no jargon.
5. Use a respectful, moderately formal tone — NOT street slang, NOT bureaucratic language.
6. Be 100% accurate to the Israeli Highway Code — never add or omit meaning.
7. Use correct Amharic spelling and diacritics (fidel) — this is critical.
8. Return valid JSON only — no markdown, no extra text, no code fences.`;

function buildPrompt(sign) {
  const signNum = sign.image_filename?.replace(/\.(png|jpg)$/i, '');
  const isNumeric = signNum && /^\d+$/.test(signNum);

  if (isNumeric) {
    return `This is Israeli traffic sign number ${signNum} (from the Israeli Highway Code).

Look at the image and use your knowledge of Israeli traffic laws (תקנות התעבורה) to write complete educational Amharic content for Ethiopian immigrants learning to drive in Israel.

Return JSON with this exact structure:
{
  "name_amharic": "full descriptive sentence up to 15 words",
  "explanation_amharic": "2-3 sentences: meaning + what driver must do + consequence",
  "questions": [
    {
      "question_amharic": "question in Amharic?",
      "explanation_correct_amharic": "why correct answer is right",
      "explanation_wrong_amharic": "what the driver risks by choosing wrong",
      "answers": [
        { "id": "A", "text_amharic": "full sentence answer", "is_correct": false },
        { "id": "B", "text_amharic": "full sentence answer", "is_correct": true },
        { "id": "C", "text_amharic": "full sentence answer", "is_correct": false },
        { "id": "D", "text_amharic": "full sentence answer", "is_correct": false }
      ]
    },
    { "question_amharic": "...", "explanation_correct_amharic": "...", "explanation_wrong_amharic": "...", "answers": [...] },
    { "question_amharic": "...", "explanation_correct_amharic": "...", "explanation_wrong_amharic": "...", "answers": [...] }
  ]
}`;
  }

  // Fallback for non-numeric signs (semantic IDs) — name + explanation only
  return `Write educational Amharic content for this Israeli traffic sign.

Hebrew sign name: ${sign.name_hebrew}
Sign category: ${sign.topic_id || 'traffic sign'}

Teach the learner: what this sign means, what the driver must do, and why it matters.
Return JSON:
{
  "name_amharic": "...",
  "explanation_amharic": "..."
}`;
}

// ─── Image loader ─────────────────────────────────────────────────────────────

// Folders where downloaded sign images live, searched in order
const IMAGE_FOLDERS = [
  join(ROOT, 'assets', 'images', 'תמרורי זכות קדימה'),
  join(ROOT, 'assets', 'images', 'תמרורי הוריה'),
  join(ROOT, 'assets', 'images', 'תמרורי אזהרה'),
  join(ROOT, 'assets', 'images', 'תמרורי איסורים והגבלות'),
  join(ROOT, 'assets', 'images', 'תמרורי מודיעין והדרכה'),
  join(ROOT, 'assets', 'images', 'תמרורי תחבורה ציבורית'),
  join(ROOT, 'assets', 'images', 'תמרורי רמזורים ובקרת נתיבים'),
];

function loadSignImage(sign) {
  const base = sign.image_filename?.replace(/\.(png|jpg|jpeg)$/i, '');
  if (!base) return null;
  const exts = ['.png', '.jpg', '.jpeg'];
  for (const folder of IMAGE_FOLDERS) {
    for (const ext of exts) {
      const p = join(folder, base + ext);
      if (existsSync(p)) {
        const data = readFileSync(p);
        const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
        return { base64: data.toString('base64'), mime };
      }
    }
  }
  return null;
}

// ─── Gemini API call ──────────────────────────────────────────────────────────

async function callGemini(sign, attempt = 1) {
  const img = loadSignImage(sign);
  const textPart = { text: buildPrompt(sign) };
  const userParts = img
    ? [{ inline_data: { mime_type: img.mime, data: img.base64 } }, textPart]
    : [textPart];

  const body = {
    system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [{ role: 'user', parts: userParts }],
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

  if (!parsed.name_amharic || !parsed.explanation_amharic) {
    throw new Error(`Missing fields in response: ${JSON.stringify(parsed)}`);
  }

  // Validate questions if present
  if (parsed.questions) {
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
  }

  return parsed;
}

async function callGeminiWithRetry(sign) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await callGemini(sign, attempt);
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      process.stdout.write(` ⚠️  retry ${attempt}/${MAX_RETRIES}...`);
      await sleep(RETRY_DELAY_MS);
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function formatDiff(field, oldVal, newVal) {
  if (oldVal === newVal) return '';
  return `    ${field}:\n      − ${oldVal}\n      + ${newVal}\n`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!API_KEY) {
    console.error('❌  GEMINI_API_KEY is not set in .env');
    process.exit(1);
  }

  console.log(`\n🤖  improveAmharicWithGemini.mjs${DRY_RUN ? '  [DRY-RUN — no files will be changed]' : ''}`);
  console.log('═'.repeat(60));

  // Load signs
  const signsData = JSON.parse(readFileSync(SIGNS_PATH, 'utf-8'));
  const signs     = Array.isArray(signsData) ? signsData : signsData.signs ?? Object.values(signsData);

  // Resolve start index — either from --sign-number or --offset
  let startIndex = OFFSET;
  if (SIGN_NUMBER !== null) {
    startIndex = signs.findIndex(s => s.image_filename === `${SIGN_NUMBER}.png`);
    if (startIndex === -1) {
      console.error(`❌  Sign number ${SIGN_NUMBER} not found (image_filename: "${SIGN_NUMBER}.png" missing in signs.json)`);
      process.exit(1);
    }
    console.log(`🔍  --sign-number ${SIGN_NUMBER} → found at position ${startIndex + 1} in array`);
  }

  const end = LIMIT === Infinity ? signs.length : startIndex + LIMIT;
  const signsToProcess = signs.slice(startIndex, end);
  const firstSign = signsToProcess[0];
  const lastSign  = signsToProcess[signsToProcess.length - 1];
  console.log(`📋  Signs loaded: ${signs.length}  |  Processing: ${signsToProcess.length}  (${firstSign?.id} → ${lastSign?.id})`);

  // Backup (only in live mode)
  if (!DRY_RUN) {
    copyFileSync(SIGNS_PATH, BACKUP_PATH);
    console.log(`💾  Backup saved → content/signs.json.backup`);
  }

  console.log(`\n🔄  Processing signs (${DRY_RUN ? 'dry-run preview' : 'live'})...\n`);

  let changed     = 0;
  let unchanged   = 0;
  let failed      = 0;
  const audioToDelete = [];
  const diffLines     = [];

  for (let i = 0; i < signsToProcess.length; i++) {
    const sign = signsToProcess[i];
    const num  = String(startIndex + i + 1).padStart(2, ' ');
    process.stdout.write(`  ${num}/${signs.length}  ${sign.id.padEnd(20)} `);

    let result;
    try {
      result = await callGeminiWithRetry(sign);
    } catch (err) {
      process.stdout.write(`❌  FAILED: ${err.message.slice(0, 80)}\n`);
      failed++;
      await sleep(DELAY_MS);
      continue;
    }

    const nameChanged = result.name_amharic        !== sign.name_amharic;
    const explChanged = result.explanation_amharic  !== sign.explanation_amharic;
    const hasNewQuestions = Array.isArray(result.questions) && result.questions.length === 3;

    if (!nameChanged && !explChanged && !hasNewQuestions) {
      process.stdout.write(`✓  (unchanged)\n`);
      unchanged++;
    } else {
      process.stdout.write(`✏️  changed${hasNewQuestions ? ' + questions' : ''}\n`);
      changed++;

      // Collect diff
      const diff = formatDiff('name_amharic', sign.name_amharic, result.name_amharic)
                 + formatDiff('explanation_amharic', sign.explanation_amharic, result.explanation_amharic);
      if (diff) diffLines.push(`  ${sign.id} (${sign.name_hebrew}):\n${diff}`);

      // Track audio files to delete (name + explanation)
      if (nameChanged && sign.audio_name_filename) audioToDelete.push(sign.audio_name_filename);
      if (explChanged && sign.audio_explanation_filename) audioToDelete.push(sign.audio_explanation_filename);

      // Track old question audio files
      if (hasNewQuestions && sign.questions) {
        for (const q of sign.questions) {
          if (q.question_audio) audioToDelete.push(q.question_audio);
          if (q.explanation_correct_audio) audioToDelete.push(q.explanation_correct_audio);
          if (q.explanation_wrong_audio) audioToDelete.push(q.explanation_wrong_audio);
          for (const a of (q.answers || [])) {
            if (a.audio_filename) audioToDelete.push(a.audio_filename);
          }
        }
      }

      // Apply changes
      if (!DRY_RUN) {
        sign.name_amharic        = result.name_amharic;
        sign.explanation_amharic = result.explanation_amharic;

        // Apply new questions with auto-generated IDs and audio filenames
        if (hasNewQuestions) {
          const signNum = sign.image_filename?.replace(/\.(png|jpg)$/i, '');
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
        }
      }
    }

    // Incremental save after every sign (live mode only)
    if (!DRY_RUN) {
      writeFileSync(SIGNS_PATH, JSON.stringify(Array.isArray(signsData) ? signs : signsData, null, 2), 'utf-8');
    }

    // Rate limit
    if (i < signsToProcess.length - 1) await sleep(DELAY_MS);
  }

  // ─── Summary ────────────────────────────────────────────────────────────────

  console.log('\n' + '═'.repeat(60));
  console.log(`📊  Results:`);
  console.log(`   ✏️   Changed  : ${changed}`);
  console.log(`   ✓   Unchanged: ${unchanged}`);
  console.log(`   ❌  Failed   : ${failed}`);

  if (diffLines.length > 0) {
    console.log(`\n📝  Changes summary:\n`);
    diffLines.forEach(d => console.log(d));
  }

  // ─── Audio cleanup ──────────────────────────────────────────────────────────

  if (audioToDelete.length > 0 && !DRY_RUN) {
    console.log(`\n🗑️   Deleting ${audioToDelete.length} stale audio files...`);
    let deleted = 0;
    for (const filename of audioToDelete) {
      const filePath = join(AUDIO_DIR, filename);
      if (existsSync(filePath)) {
        unlinkSync(filePath);
        deleted++;
      }
    }
    console.log(`   Deleted: ${deleted} files (${audioToDelete.length - deleted} were already missing)`);
  }

  if (DRY_RUN && audioToDelete.length > 0) {
    console.log(`\n🗑️   Audio files that would be deleted (${audioToDelete.length}):`);
    audioToDelete.forEach(f => console.log(`   - ${f}`));
  }

  // ─── Next steps ─────────────────────────────────────────────────────────────

  if (!DRY_RUN && changed > 0) {
    console.log(`\n⏭️   Next steps:`);
    console.log(`   1. npx tsx scripts/generateAllAudio.ts`);
    console.log(`   2. node --env-file=.env scripts/uploadNewAudio.mjs`);
  }

  if (DRY_RUN) {
    console.log(`\n✅  Dry-run complete. Run without --dry-run to apply changes.`);
  } else {
    console.log(`\n✅  Done! signs.json updated.`);
    if (changed > 0) console.log(`   Backup preserved at: content/signs.json.backup`);
  }
}

main().catch(err => {
  console.error('\n💥  Fatal error:', err.message);
  process.exit(1);
});
